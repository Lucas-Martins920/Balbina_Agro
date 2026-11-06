-- Conciliação mais simples: extrato automático por Open Finance (agregador Pluggy), palpite de categoria
-- pelo histórico, sugestão de transferência entre contas próprias e "conciliar as certeiras" em um clique.

-- ---------------------------------------------------------------------------
-- Conexões Open Finance
-- ---------------------------------------------------------------------------

-- Uma conexão é um consentimento num banco (o "item" do agregador); cada conta do banco vira
-- uma conta_financeira ligada por open_finance_conta_id.
create table conexoes_bancarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  provedor text not null default 'pluggy' check (provedor in ('pluggy')),
  item_id text not null,
  instituicao text,
  status text not null default 'ativa' check (status in ('ativa', 'atualizando', 'precisa_login', 'erro', 'desconectada')),
  erro text,
  ultima_sincronizacao timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provedor, item_id)
);
create index on conexoes_bancarias (empresa_id);
alter table conexoes_bancarias enable row level security;
create policy membros on conexoes_bancarias using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));

alter table contas_financeiras
  add column open_finance_conta_id text,
  add column saldo_banco_cents bigint,          -- saldo informado pelo banco na última sincronização
  add column saldo_banco_em timestamptz;
create unique index contas_financeiras_open_finance_un on contas_financeiras (open_finance_conta_id) where open_finance_conta_id is not null;

-- ---------------------------------------------------------------------------
-- Palpite: como lançar um movimento que não tem título, aprendendo com o que já foi conciliado
-- ---------------------------------------------------------------------------

-- "PIX RECEBIDO 12/09 MERCADO BOM PRECO 1234" e "PIX RECEBIDO 15/10 MERCADO BOM PRECO 9876" têm a mesma chave.
create or replace function app.chave_descricao(p text) returns text
language sql immutable as $$
  select left(trim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[^a-zà-ÿ]+', ' ', 'g'), '\s+', ' ', 'g')), 60)
$$;

-- Mesmo CPF/CNPJ vale mais que descrição parecida; entre iguais, o mais recente.
-- Sem histórico, ao menos o contato com o mesmo CPF/CNPJ.
create or replace function public.palpite_lancamento(p_movimento uuid)
returns table (categoria_id uuid, centro_custo_id uuid, contato_id uuid, origem text)
language sql stable set search_path = public as $$
  with m as (select * from movimentos_bancarios where id = p_movimento),
  contato as (
    select c.id from m join contatos c on c.empresa_id = m.empresa_id and c.cpf_cnpj = m.cpf_cnpj_contraparte and not c.arquivado
    limit 1
  ),
  historico as (
    select r.categoria_id, r.centro_custo_id, a.contato_id
    from m
    join movimentos_bancarios o on o.empresa_id = m.empresa_id and o.id <> m.id and o.status = 'conciliado'
                               and sign(o.valor_cents) = sign(m.valor_cents)
                               and ((m.cpf_cnpj_contraparte is not null and o.cpf_cnpj_contraparte = m.cpf_cnpj_contraparte)
                                    or app.chave_descricao(o.descricao) = app.chave_descricao(m.descricao))
    join conciliacoes c on c.movimento_id = o.id and c.baixa_id is not null
    join baixas b on b.id = c.baixa_id
    join agendamentos a on a.id = b.agendamento_id
    cross join lateral (select x.categoria_id, x.centro_custo_id from agendamento_rateios x
                        where x.agendamento_id = a.id order by x.valor_cents desc limit 1) r
    order by (m.cpf_cnpj_contraparte is not null and o.cpf_cnpj_contraparte = m.cpf_cnpj_contraparte) desc, o.data desc, o.created_at desc
    limit 1
  )
  select h.categoria_id, h.centro_custo_id, coalesce(h.contato_id, (select id from contato)), 'historico' from historico h
  union all
  select null, null, c.id, 'contato' from contato c where not exists (select 1 from historico)
$$;

-- ---------------------------------------------------------------------------
-- Painel: tudo o que a tela precisa de cada pendente numa consulta só
-- ---------------------------------------------------------------------------

-- certeira: a melhor sugestão tem o valor exato, data próxima ou mesmo CPF/CNPJ, e nenhuma outra chega perto.
create or replace function public.painel_conciliacao(p_conta uuid, p_limite int default 50)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint, nome_contraparte text, cpf_cnpj_contraparte text,
               sugestoes jsonb, palpite jsonb, transferencia jsonb, certeira uuid)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, m.nome_contraparte, m.cpf_cnpj_contraparte,
         s.lista, p.palpite, t.transferencia,
         case when (s.lista->0->>'pontos')::int >= 70
                   and (s.lista->0->>'saldo_cents')::bigint = abs(m.valor_cents)
                   and coalesce((s.lista->1->>'pontos')::int, 0) < (s.lista->0->>'pontos')::int - 10
              then (s.lista->0->>'agendamento_id')::uuid end
  from movimentos_bancarios m
  cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.pontos desc, abs(x.vencimento - m.data)), '[]'::jsonb) as lista
    from public.sugestoes_conciliacao(m.id) x
  ) s
  left join lateral (select to_jsonb(x) as palpite from public.palpite_lancamento(m.id) x limit 1) p on true
  left join lateral (
    -- a outra perna: mesmo valor com sinal trocado noutra conta da empresa, até 3 dias de diferença
    select jsonb_build_object('conta_id', o.conta_id, 'conta_nome', cf.nome) as transferencia
    from movimentos_bancarios o join contas_financeiras cf on cf.id = o.conta_id
    where o.empresa_id = m.empresa_id and o.conta_id <> m.conta_id and o.valor_cents = -m.valor_cents
      and abs(o.data - m.data) <= 3 and o.status <> 'ignorado'
    order by abs(o.data - m.data)
    limit 1
  ) t on true
  where m.conta_id = p_conta and m.status = 'pendente'
  order by m.data, m.id
  limit p_limite
$$;

-- Aceita de uma vez todas as sugestões certeiras da conta. Revalida o saldo do título a cada passo,
-- porque dois pagamentos iguais podem apontar para o mesmo título.
create or replace function public.conciliar_certeiras(p_conta uuid) returns int
language plpgsql set search_path = public as $$
declare
  r record;
  v_n int := 0;
begin
  for r in select x.movimento_id, x.valor_cents, x.certeira from public.painel_conciliacao(p_conta, 1000) x where x.certeira is not null loop
    continue when not exists (select 1 from titulos where id = r.certeira and status in ('aberto', 'parcial')
                              and saldo_cents = abs(r.valor_cents));
    perform public.conciliar_com_titulo(r.movimento_id, r.certeira, 'lote');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.palpite_lancamento(uuid) to authenticated;
    grant execute on function public.painel_conciliacao(uuid, int) to authenticated;
    grant execute on function public.conciliar_certeiras(uuid) to authenticated;
  end if;
end $$;
