-- E2 e D3 do estudo de automação (docs/estudo-automacao.html).
--
-- E2 lcdpr_config: cadastro que o Livro Caixa Digital do Produtor Rural pede e o Balbina não tem (CPF do
--    titular, CAEPF, número do imóvel na Receita, código IBGE do município). lcdpr_lancamentos() tira
--    os lançamentos do financeiro realizado (baixas), sem financiamentos. O arquivo é montado no app
--    (src/lib/lcdpr.ts).
-- D3 portal do cliente: link próprio de cada cliente (contatos.portal_token) para ele fazer o pedido com
--    os preços da tabela dele. O pedido entra em aberto, origem 'portal', e a piscicultura confere e fatura.

-- E2 ------------------------------------------------------------------------------------------------
create table lcdpr_config (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  cpf text check (cpf is null or cpf ~ '^\d{11}$'),
  nome text,
  forma_apuracao smallint not null default 1 check (forma_apuracao in (1, 2)),
  endereco text, numero text, complemento text, bairro text, uf text, cod_mun text check (cod_mun is null or cod_mun ~ '^\d{7}$'),
  cep text check (cep is null or cep ~ '^\d{8}$'), telefone text, email text,
  imovel_nome text, imovel_endereco text, imovel_numero text, imovel_complemento text, imovel_bairro text, imovel_uf text,
  imovel_cod_mun text check (imovel_cod_mun is null or imovel_cod_mun ~ '^\d{7}$'),
  imovel_cep text check (imovel_cep is null or imovel_cep ~ '^\d{8}$'),
  cad_itr text check (cad_itr is null or cad_itr ~ '^\d{8}$'),
  caepf text check (caepf is null or caepf ~ '^\d{14}$'),
  inscricao_estadual text,
  tipo_exploracao smallint not null default 1 check (tipo_exploracao between 1 and 6),
  participacao_centesimos int not null default 10000 check (participacao_centesimos between 1 and 10000),
  contador_nome text, contador_documento text, contador_crc text, contador_email text, contador_fone text,
  updated_at timestamptz not null default now()
);
alter table lcdpr_config enable row level security;
create policy membros on lcdpr_config using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on lcdpr_config as restrictive for insert with check (app.pode(empresa_id, 'configuracoes.editar'));
create policy escrita_alterar on lcdpr_config as restrictive for update
  using (app.pode(empresa_id, 'configuracoes.editar')) with check (app.pode(empresa_id, 'configuracoes.editar'));
create policy escrita_apagar on lcdpr_config as restrictive for delete using (app.pode(empresa_id, 'configuracoes.editar'));

-- Recebimentos e pagamentos do período, um por baixa. Rateio em categoria de financiamento (empréstimo,
-- aporte) fica fora; o resto entra na proporção. Lido com as permissões de quem pede (RLS).
create or replace function public.lcdpr_lancamentos(p_empresa uuid, p_de date, p_ate date)
returns table (data date, conta_id uuid, num_doc text, hist text, id_partic text, tipo_lanc smallint, tipo_doc smallint,
               entrada_cents bigint, saida_cents bigint)
language sql stable set search_path = public as $$
  with base as (
    select b.data, b.conta_id, a.referencia, a.descricao, a.tipo, a.forma_pagamento, c.cpf_cnpj,
           b.valor_cents + b.juros_cents + b.multa_cents - b.desconto_cents as total,
           (select coalesce(sum(r.valor_cents) filter (where cat.grupo <> 'financiamento'), 0)::numeric / nullif(sum(r.valor_cents), 0)
            from agendamento_rateios r join categorias cat on cat.id = r.categoria_id where r.agendamento_id = a.id) as fracao
    from baixas b
    join agendamentos a on a.id = b.agendamento_id
    left join contatos c on c.id = a.contato_id
    where b.empresa_id = p_empresa and b.data between p_de and p_ate
  )
  select data, conta_id,
         case when referencia ~ '^\d{44}$' then ltrim(substr(referencia, 26, 9), '0') else left(referencia, 60) end,
         descricao, cpf_cnpj,
         (case when tipo = 'receber' then 1 else 2 end)::smallint,
         (case when referencia ~ '^\d{44}$' then 1 when forma_pagamento = 'boleto' or referencia ~ '^\d{47,48}$' then 2 else 6 end)::smallint,
         case when tipo = 'receber' then round(total * fracao)::bigint else 0 end,
         case when tipo = 'pagar' then round(total * fracao)::bigint else 0 end
  from base
  where coalesce(fracao, 0) > 0 and round(total * fracao) > 0
  order by data
$$;

-- D3 ------------------------------------------------------------------------------------------------
alter table contatos add column portal_token text unique check (portal_token is null or portal_token ~ '^[a-f0-9]{32}$');

alter table pedidos_venda drop constraint if exists pedidos_venda_origem_check;
alter table pedidos_venda add constraint pedidos_venda_origem_check check (origem in ('web', 'app', 'pdv', 'portal'));

-- Cliente do link (só cliente ativo de empresa liberada com o módulo de vendas).
create or replace function app.cliente_do_portal(p_token text)
returns contatos
language sql stable security definer set search_path = public as $$
  select c.* from contatos c
  where c.portal_token = p_token and p_token ~ '^[a-f0-9]{32}$' and not c.arquivado and 'cliente' = any(c.tipos)
    and app.empresa_liberada(c.empresa_id) and app.plano_inclui(c.empresa_id, 'vendas')
$$;

-- O que o cliente vê no link: nome da piscicultura, os produtos com o preço dele e os últimos pedidos.
create or replace function public.portal_cliente(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c contatos;
  v_hoje date;
begin
  c := app.cliente_do_portal(p_token);
  if c.id is null then return null; end if;
  v_hoje := app.hoje(c.empresa_id);
  return jsonb_build_object(
    'empresa', (select coalesce(nullif(nome_fantasia, ''), razao_social) from empresas where id = c.empresa_id),
    'cliente', c.nome,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'unidade', p.unidade, 'preco_cents', x.preco) order by p.nome)
      from produtos p cross join lateral (select public.preco_vigente(p.id, c.id, v_hoje) as preco) x
      where p.empresa_id = c.empresa_id and p.ativo and not p.base_estoque and p.tipo in ('ovo', 'peixe', 'outro') and x.preco is not null), '[]'),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object('numero', numero, 'data', data, 'entrega', entrega_prevista, 'status', status, 'total_cents', total_cents)
                       order by numero desc)
      from (select * from pedidos_venda where cliente_id = c.id order by numero desc limit 5) u), '[]'));
end $$;

-- Pedido feito pelo cliente no link. Preço sempre o da tabela (o que vier do navegador é ignorado),
-- à vista e em aberto para a piscicultura conferir. No máximo 5 pedidos do link por cliente por dia.
create or replace function public.criar_pedido_portal(p_token text, p_itens jsonb, p_entrega date default null, p_observacoes text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  c contatos;
  v_hoje date;
  v_itens jsonb;
  v_pedido uuid;
begin
  c := app.cliente_do_portal(p_token);
  if c.id is null then raise exception 'Link de pedido inválido ou desativado' using errcode = 'insufficient_privilege'; end if;
  v_hoje := app.hoje(c.empresa_id);
  if (select count(*) from pedidos_venda where cliente_id = c.id and origem = 'portal' and data = v_hoje) >= 5 then
    raise exception 'Muitos pedidos hoje por este link. Fale com a piscicultura.' using errcode = 'check_violation';
  end if;
  if p_entrega is not null and (p_entrega < v_hoje or p_entrega > v_hoje + 60) then
    raise exception 'Data de entrega fora do prazo' using errcode = 'check_violation';
  end if;
  select jsonb_agg(jsonb_build_object('produto_id', x->>'produto_id', 'quantidade', (x->>'quantidade')::numeric))
  into v_itens
  from jsonb_array_elements(coalesce(p_itens, '[]')) x
  where coalesce((x->>'quantidade')::numeric, 0) > 0
    and exists (select 1 from produtos p where p.id = (x->>'produto_id')::uuid and p.empresa_id = c.empresa_id and p.ativo
                and not p.base_estoque and p.tipo in ('ovo', 'peixe', 'outro'));
  if v_itens is null then raise exception 'Escolha pelo menos um produto' using errcode = 'check_violation'; end if;
  if (select count(*) from jsonb_array_elements(v_itens)) > 30 then raise exception 'Itens demais' using errcode = 'check_violation'; end if;

  v_pedido := public.criar_pedido(c.empresa_id, c.id, v_itens, v_hoje, p_entrega, '[{"dias":0,"pct":100}]', null,
    concat_ws(' ', 'Pedido do cliente pelo link: confira condição e entrega.', left(nullif(trim(p_observacoes), ''), 500)), null, 'portal');
  return (select numero from pedidos_venda where id = v_pedido);
end $$;

revoke all on function public.portal_cliente(text), public.criar_pedido_portal(text, jsonb, date, text), app.cliente_do_portal(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- o link é aberto sem login: a página chama pelo servidor (service_role), nunca o navegador
    revoke all on function public.portal_cliente(text), public.criar_pedido_portal(text, jsonb, date, text) from anon, authenticated;
    grant execute on function public.portal_cliente(text), public.criar_pedido_portal(text, jsonb, date, text) to service_role;
    revoke all on function public.lcdpr_lancamentos(uuid, date, date) from anon;
    grant execute on function public.lcdpr_lancamentos(uuid, date, date) to authenticated;
  end if;
end $$;

select app.travar_referencias();
