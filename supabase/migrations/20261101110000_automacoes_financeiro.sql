-- Automações do financeiro (C1, C2 e C6 do estudo docs/estudo-automacao.html).
--
-- C1 palpites_firmes / lancar_pelo_historico: lançamento do extrato sem título aberto que, nas últimas
--    vezes (mesmo CPF/CNPJ ou mesma descrição), foi lançado sempre na mesma categoria vira pagamento ou
--    recebimento em lote, com um clique de quem concilia.
-- C2 regras_sugeridas: o que foi conciliado à mão 3 vezes ou mais do mesmo jeito e nenhuma regra pega
--    vira sugestão de regra automática.
-- C6 recorrencias_sugeridas: conta que aparece todo mês (mesmo fornecedor ou descrição, valor parecido)
--    e não é recorrência vira sugestão de recorrência.
-- sugestoes_dispensadas: o "não, obrigado" de cada sugestão, para ela não voltar.

create table sugestoes_dispensadas (
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null check (tipo in ('regra', 'recorrencia')),
  chave text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (empresa_id, tipo, chave)
);
alter table sugestoes_dispensadas enable row level security;
create policy membros on sugestoes_dispensadas using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on sugestoes_dispensadas as restrictive for insert
  with check (app.pode_algum(empresa_id, array['conciliacao.regras', 'financeiro.editar']));
create policy escrita_apagar on sugestoes_dispensadas as restrictive for delete
  using (app.pode_algum(empresa_id, array['conciliacao.regras', 'financeiro.editar']));

-- Chave que agrupa lançamentos "iguais": CPF/CNPJ quando há, senão a descrição sem números.
create or replace function app.chave_lancamento(p_cpf_cnpj text, p_descricao text) returns text
language sql immutable as $$
  select case when coalesce(p_cpf_cnpj, '') <> '' then 'doc:' || p_cpf_cnpj else 'desc:' || app.chave_descricao(p_descricao) end
$$;

-- Histórico de um lançamento do extrato: as conciliações anteriores com título, mais recentes primeiro.
create or replace function app.historico_movimento(m movimentos_bancarios)
returns table (data date, categoria_id uuid, centro_custo_id uuid, contato_id uuid)
language sql stable set search_path = public as $$
  select o.data, r.categoria_id, r.centro_custo_id, a.contato_id
  from movimentos_bancarios o
  join conciliacoes c on c.movimento_id = o.id and c.baixa_id is not null
  join baixas b on b.id = c.baixa_id
  join agendamentos a on a.id = b.agendamento_id
  cross join lateral (select x.categoria_id, x.centro_custo_id from agendamento_rateios x
                      where x.agendamento_id = a.id order by x.valor_cents desc limit 1) r
  where o.empresa_id = m.empresa_id and o.id <> m.id and o.status = 'conciliado'
    and sign(o.valor_cents) = sign(m.valor_cents)
    and app.chave_lancamento(o.cpf_cnpj_contraparte, o.descricao) = app.chave_lancamento(m.cpf_cnpj_contraparte, m.descricao)
  order by o.data desc, o.created_at desc
  limit 3
$$;

-- C1: pendentes da conta com palpite firme (2 ou 3 últimas vezes na mesma categoria) e sem título aberto
-- que sirva (esses vão pela sugestão, nunca viram título novo).
create or replace function public.palpites_firmes(p_conta uuid)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint,
               categoria_id uuid, centro_custo_id uuid, contato_id uuid, vezes int)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, h.categoria_id, h.centro_custo_id, h.contato_id, h.vezes::int
  from movimentos_bancarios m
  cross join lateral (
    select (array_agg(x.categoria_id))[1] categoria_id, (array_agg(x.centro_custo_id))[1] centro_custo_id,
           (array_agg(x.contato_id))[1] contato_id, count(*) vezes, count(distinct x.categoria_id) categorias
    from app.historico_movimento(m) x
  ) h
  where m.conta_id = p_conta and m.status = 'pendente'
    and h.vezes >= 2 and h.categorias = 1
    and exists (select 1 from categorias k where k.id = h.categoria_id and k.ativa
                and k.sentido = case when m.valor_cents > 0 then 'entrada' else 'saida' end)
    and not exists (select 1 from public.sugestoes_conciliacao(m.id))
  order by m.data, m.id
  limit 200
$$;

create or replace function public.lancar_pelo_historico(p_conta uuid) returns int
language plpgsql set search_path = public as $$
declare
  p record;
  v_n int := 0;
begin
  for p in select * from public.palpites_firmes(p_conta) loop
    perform public.conciliar_criando_titulo(p.movimento_id, p.categoria_id, p.centro_custo_id, p.contato_id, null);
    update conciliacoes set modo = 'lote' where movimento_id = p.movimento_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- C2: regras que valem a pena. Conciliações com título dos últimos 180 dias, agrupadas pela chave;
-- 3 ou mais e ao menos 80% na mesma categoria; nenhuma regra ativa pega o lançamento mais recente.
create or replace function public.regras_sugeridas(p_empresa uuid)
returns table (chave text, tipo text, cpf_cnpj text, descricao text, nome_contraparte text,
               categoria_id uuid, centro_custo_id uuid, contato_id uuid, vezes int)
language sql stable set search_path = public as $$
  with base as (
    select o.*, r.categoria_id, r.centro_custo_id, a.contato_id,
           app.chave_lancamento(o.cpf_cnpj_contraparte, o.descricao) as k,
           case when o.valor_cents > 0 then 'recebimento' else 'pagamento' end as t
    from movimentos_bancarios o
    join conciliacoes c on c.movimento_id = o.id and c.baixa_id is not null and c.modo <> 'regra'
    join baixas b on b.id = c.baixa_id
    join agendamentos a on a.id = b.agendamento_id
    cross join lateral (select x.categoria_id, x.centro_custo_id from agendamento_rateios x
                        where x.agendamento_id = a.id order by x.valor_cents desc limit 1) r
    where o.empresa_id = p_empresa and o.status = 'conciliado' and o.data >= current_date - 180
  ), grupos as (
    select k, t, count(*) total,
           mode() within group (order by categoria_id) categoria_id
    from base group by k, t having count(*) >= 3
  ), escolhidos as (
    select g.*, (select count(*) from base b where b.k = g.k and b.t = g.t and b.categoria_id = g.categoria_id) iguais
    from grupos g
  )
  select e.t || ':' || e.k, e.t, ult.cpf_cnpj_contraparte, ult.descricao, ult.nome_contraparte,
         e.categoria_id, ult.centro_custo_id, ult.contato_id, e.total::int
  from escolhidos e
  cross join lateral (select * from base b where b.k = e.k and b.t = e.t and b.categoria_id = e.categoria_id
                      order by b.data desc, b.created_at desc limit 1) ult
  where e.iguais::numeric / e.total >= 0.8
    and not exists (select 1 from regras_conciliacao x
                    join movimentos_bancarios mb on mb.id = ult.id
                    where x.empresa_id = p_empresa and app.regra_casa(x, mb))
    and not exists (select 1 from sugestoes_dispensadas d where d.empresa_id = p_empresa and d.tipo = 'regra' and d.chave = e.t || ':' || e.k)
  order by e.total desc
  limit 20
$$;

-- C6: contas que se repetem todo mês. Títulos (não cancelados, fora de recorrência) dos últimos 6 meses,
-- agrupados por tipo + contato (ou descrição): 3 meses ou mais, no máximo um por mês, valor parecido
-- (maior ≤ 1,25 × menor) e presente no mês atual ou no anterior. Sem recorrência ativa igual.
create or replace function public.recorrencias_sugeridas(p_empresa uuid)
returns table (chave text, tipo text, descricao text, contato_id uuid, contato_nome text, categoria_id uuid,
               centro_custo_id uuid, valor_cents bigint, dia smallint, meses int, proximo date)
language sql stable set search_path = public as $$
  with base as (
    select a.*, r.categoria_id, r.centro_custo_id,
           a.tipo || ':' || coalesce('ct:' || a.contato_id::text, 'desc:' || app.chave_descricao(a.descricao)) as k
    from agendamentos a
    cross join lateral (select x.categoria_id, x.centro_custo_id from agendamento_rateios x
                        where x.agendamento_id = a.id order by x.valor_cents desc limit 1) r
    where a.empresa_id = p_empresa and a.status <> 'cancelado' and a.recorrencia_id is null
      and a.parcela_total is null
      and a.vencimento >= (date_trunc('month', app.hoje(p_empresa)) - interval '5 months')::date
      and a.vencimento < (date_trunc('month', app.hoje(p_empresa)) + interval '1 month')::date
  ), grupos as (
    select k, count(*) n, count(distinct date_trunc('month', vencimento)) meses,
           max(vencimento) ultimo, min(valor_cents) menor, max(valor_cents) maior,
           percentile_disc(0.5) within group (order by valor_cents) mediana,
           mode() within group (order by extract(day from vencimento)::smallint) dia,
           mode() within group (order by categoria_id) categoria_id
    from base group by k
  )
  select g.k, u.tipo, u.descricao, u.contato_id, ct.nome, g.categoria_id, u.centro_custo_id,
         g.mediana, g.dia, g.meses::int,
         -- próximo vencimento: o dia de costume no mês seguinte ao último título (dia 31 vira o último do mês)
         least((date_trunc('month', g.ultimo) + interval '1 month')::date + (g.dia - 1),
               (date_trunc('month', g.ultimo) + interval '2 months')::date - 1)
  from grupos g
  cross join lateral (select * from base b where b.k = g.k order by b.vencimento desc limit 1) u
  left join contatos ct on ct.id = u.contato_id
  where g.meses >= 3 and g.n = g.meses and g.maior <= g.menor * 1.25
    and g.ultimo >= (date_trunc('month', app.hoje(p_empresa)) - interval '1 month')::date
    and not exists (select 1 from recorrencias rc where rc.empresa_id = p_empresa and rc.status = 'ativa' and rc.tipo = u.tipo
                    and ((u.contato_id is not null and rc.contato_id = u.contato_id)
                         or app.chave_descricao(rc.descricao) = app.chave_descricao(u.descricao)))
    and not exists (select 1 from sugestoes_dispensadas d where d.empresa_id = p_empresa and d.tipo = 'recorrencia' and d.chave = g.k)
  order by g.meses desc, g.mediana desc
  limit 20
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.palpites_firmes(uuid), public.lancar_pelo_historico(uuid),
      public.regras_sugeridas(uuid), public.recorrencias_sugeridas(uuid) from anon;
    grant execute on function public.palpites_firmes(uuid), public.lancar_pelo_historico(uuid),
      public.regras_sugeridas(uuid), public.recorrencias_sugeridas(uuid) to authenticated;
  end if;
end $$;

select app.travar_referencias();
