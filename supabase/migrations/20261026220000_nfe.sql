-- NF-e (modelo 55) dos pedidos de venda pela Focus NFe.

-- Tributação padrão da venda de ovos. Ovos in natura costumam ser isentos de ICMS e têm PIS/COFINS
-- com alíquota zero, mas quem decide é o contador: tudo aqui é editável na tela de notas.
alter table empresas add column config_fiscal jsonb not null default '{}';

alter table notas_fiscais add column payload jsonb;

-- Produtor rural pessoa física emite com CPF e inscrição estadual: a piscicultura pode ter CPF no lugar do CNPJ.
-- A coluna continua chamando cnpj para não quebrar o que já existe; guarda 11 ou 14 dígitos.
alter table empresas drop constraint empresas_cnpj_check;
alter table empresas add constraint empresas_cnpj_check check (cnpj ~ '^(\d{11}|\d{14})$');
-- Fornecedor produtor rural: na compra dele a piscicultura pessoa jurídica pode ter de reter Funrural
alter table contatos add column produtor_rural boolean not null default false;
create unique index notas_fiscais_pedido_ativa_un on notas_fiscais (pedido_venda_id)
  where status in ('rascunho', 'processando', 'autorizada', 'cancelando');
create unique index notas_fiscais_ref_un on notas_fiscais (provedor_ref) where provedor_ref is not null;

-- Valores efetivos da configuração fiscal: o que a empresa preencheu sobre os padrões do regime.
create or replace function app.config_fiscal(e empresas) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cfop_interna', '5101', 'cfop_interestadual', '6101',
    'icms_situacao', case when e.regime_tributario = 'simples' then '400' else '40' end,
    'pis_situacao', case when e.regime_tributario = 'simples' then '49' else '06' end,
    'cofins_situacao', case when e.regime_tributario = 'simples' then '49' else '06' end,
    'serie', 1, 'informacoes_adicionais', '',
    -- Funrural + Senar sobre a receita bruta do produtor pessoa física (1,2% + 0,1% + 0,2%)
    'funrural_percentual', case when e.regime_tributario = 'produtor_rural' then 1.5 else 0 end
  ) || case when e.regime_tributario = 'produtor_rural'
            -- produtor pessoa física não é contribuinte de PIS/COFINS: operação sem incidência
            then jsonb_build_object('icms_situacao', '40', 'pis_situacao', '08', 'cofins_situacao', '08') else '{}' end
    || e.config_fiscal
$$;

create or replace function public.config_fiscal_empresa(p_empresa uuid) returns jsonb
language sql stable set search_path = public as $$
  select app.config_fiscal(e) from empresas e where e.id = p_empresa
$$;

-- Abre a nota de um pedido faturado. O app monta o JSON da Focus e envia em seguida.
create or replace function public.preparar_nfe(p_pedido uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  c contatos%rowtype;
  v_id uuid;
  v_falta text[];
begin
  select * into p from pedidos_venda where id = p_pedido;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.status not in ('faturado', 'entregue') then
    raise exception 'Fature o pedido antes de emitir a nota' using errcode = 'check_violation';
  end if;
  select * into c from contatos where id = p.cliente_id;
  v_falta := array_remove(array[
    case when c.cpf_cnpj is null then 'CPF ou CNPJ' end,
    case when coalesce(c.endereco->>'logradouro', '') = '' then 'rua' end,
    case when coalesce(c.endereco->>'numero', '') = '' then 'número' end,
    case when coalesce(c.endereco->>'bairro', '') = '' then 'bairro' end,
    case when coalesce(c.endereco->>'cep', '') !~ '^\d{8}$' then 'CEP' end,
    case when coalesce(c.cidade, '') = '' then 'cidade' end,
    case when c.uf is null then 'UF' end], null);
  if cardinality(v_falta) > 0 then
    raise exception 'Complete o cadastro de %: %', c.nome, array_to_string(v_falta, ', ') using errcode = 'check_violation';
  end if;

  v_id := gen_random_uuid();
  insert into notas_fiscais (id, empresa_id, destinatario_id, pedido_venda_id, valor_total_cents, status, provedor_ref,
                             serie, natureza_operacao)
  select v_id, p.empresa_id, p.cliente_id, p.id, p.total_cents, 'processando', 'balbina-' || replace(v_id::text, '-', ''),
         (app.config_fiscal(e)->>'serie')::int, 'Venda de produção do estabelecimento'
  from empresas e where e.id = p.empresa_id;
  return v_id;
exception when unique_violation then
  raise exception 'Este pedido já tem uma nota emitida ou em processamento' using errcode = 'check_violation';
end $$;

-- Itens da nota: um por item do pedido, com NCM do produto (ovos: 0407.21.00)
create view nfe_itens with (security_invoker = true) as
select p.id as pedido_id, p.empresa_id, row_number() over (partition by p.id order by pr.nome, i.id) as numero_item,
       coalesce(pr.sku, left(replace(pr.id::text, '-', ''), 12)) as codigo, pr.nome as descricao,
       regexp_replace(coalesce(pr.ncm, '04072100'), '\D', '', 'g') as ncm, pr.cfop_padrao, pr.unidade,
       i.quantidade, i.preco_unit_cents, i.desconto_cents, i.total_cents
from pedidos_venda p
join pedido_itens i on i.pedido_id = p.id
join produtos pr on pr.id = i.produto_id;

-- Cadastro da empresa aceita CPF (produtor rural, que precisa da inscrição estadual) ou CNPJ
drop function public.criar_empresa(text, text, text);
create or replace function public.criar_empresa(p_cnpj text, p_razao_social text, p_nome_fantasia text default null,
                                                p_inscricao_estadual text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_doc text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_ie text := nullif(regexp_replace(coalesce(p_inscricao_estadual, ''), '[^0-9A-Za-z]', '', 'g'), '');
begin
  if v_uid is null then
    raise exception 'Faça login para criar uma empresa' using errcode = 'insufficient_privilege';
  end if;
  if v_doc !~ '^(\d{11}|\d{14})$' then
    raise exception 'Informe o CNPJ (14 dígitos) ou o CPF do produtor rural (11 dígitos)' using errcode = 'check_violation';
  end if;
  if length(v_doc) = 11 and v_ie is null then
    raise exception 'Produtor rural com CPF precisa da inscrição estadual' using errcode = 'check_violation';
  end if;
  if exists (select 1 from empresas where cnpj = v_doc) then
    raise exception 'Já existe uma empresa com este documento' using errcode = 'unique_violation';
  end if;

  insert into empresas (cnpj, razao_social, nome_fantasia, inscricao_estadual, regime_tributario)
  values (v_doc, trim(p_razao_social), nullif(trim(p_nome_fantasia), ''), v_ie,
          case when length(v_doc) = 11 then 'produtor_rural' else 'simples' end)
  returning id into v_id;

  insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin)
  values (v_id, v_uid, 'sem_restricao', true);

  perform app.carregar_padroes(v_id);
  return v_id;
end $$;
revoke all on function public.criar_empresa(text, text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.criar_empresa(text, text, text, text) from anon;
    grant execute on function public.criar_empresa(text, text, text, text) to authenticated;
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.preparar_nfe(uuid) to authenticated;
    grant execute on function public.config_fiscal_empresa(uuid) to authenticated;
    grant select on nfe_itens to authenticated;
  end if;
end $$;
