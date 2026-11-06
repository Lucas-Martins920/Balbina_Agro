-- Causa das baixas no apontamento (revisão geral de 2026-10-30, item F2). A coluna
-- apontamentos_diarios.causas_morte existe desde a primeira migration, mas nada gravava nela.
-- Agora cada lançamento (turno) pode dizer quantas das mortes + descartes foram por qual causa
-- (opcional), o dia soma os turnos e a view mortalidade_causas junta por lote e mês.
-- A lista de causas é fixa e igual a src/lib/causas-morte.ts.

create or replace function app.causas_morte_validas(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('prolapso', 'canibalismo', 'doenca', 'calor', 'predador', 'acidente', 'refugo', 'outra')
          or jsonb_typeof(e.value) <> 'number'
          or e.value::numeric <> trunc(e.value::numeric)
          or e.value::numeric < 0)
$$;

create or replace function app.soma_causas_morte(p jsonb) returns bigint
language sql immutable as $$
  select coalesce(sum(e.value::numeric), 0)::bigint from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}' end) e
$$;

alter table apontamento_lancamentos add column causas_morte jsonb not null default '{}';
alter table apontamento_lancamentos add constraint causas_validas
  check (app.causas_morte_validas(causas_morte) and app.soma_causas_morte(causas_morte) <= mortes + descartes);

-- Informar a causa depois é um update do lançamento: o estoque de ovos só refaz quando mudam os ovos
-- (antes qualquer update apagava e recriava o movimento de produção, o que falha se os ovos já foram classificados).
drop trigger lancamento_para_estoque on apontamento_lancamentos;
create trigger lancamento_para_estoque after insert or delete or update of ovos, apontamento_id on apontamento_lancamentos
  for each row execute function app.lancamento_para_estoque();

-- O dia é a soma dos lançamentos, agora com as causas.
create or replace function app.totalizar_apontamento(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  a apontamentos_diarios%rowtype;
  t record;
  v_causas jsonb;
begin
  select * into a from apontamentos_diarios where id = p_id for update;
  if not found then return; end if;
  select count(*) as n, coalesce(sum(ovos), 0) as ovos, coalesce(sum(mortes), 0) as mortes,
         coalesce(sum(descartes), 0) as descartes, coalesce(sum(racao_kg), 0) as racao_kg, sum(agua_l) as agua_l,
         string_agg(observacoes, ' · ' order by turno, created_at) as observacoes
  into t from apontamento_lancamentos where apontamento_id = p_id;
  if t.n = 0 then
    delete from apontamentos_diarios where id = p_id;
  else
    select coalesce(jsonb_object_agg(c.causa, c.peixes), '{}') into v_causas
    from (select e.key as causa, sum(e.value::numeric)::bigint as peixes
          from apontamento_lancamentos l, jsonb_each(l.causas_morte) e
          where l.apontamento_id = p_id group by e.key having sum(e.value::numeric) > 0) c;
    update apontamentos_diarios set ovos_total = t.ovos, mortes = t.mortes, descartes = t.descartes,
      racao_kg = t.racao_kg, agua_l = t.agua_l, observacoes = t.observacoes, causas_morte = v_causas, updated_at = now()
    where id = p_id;
  end if;
  perform app.recalcular_peixes(a.lote_id, a.viveiro_id, a.data);
end $$;

create or replace view mortalidade_causas with (security_invoker = true) as
select d.empresa_id, d.lote_id, date_trunc('month', d.data)::date as mes, e.key as causa, sum(e.value::numeric)::bigint as peixes
from apontamentos_diarios d, jsonb_each(d.causas_morte) e
group by d.empresa_id, d.lote_id, date_trunc('month', d.data), e.key;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on mortalidade_causas to authenticated;
  end if;
end $$;
