-- Marco 1: regras de produção (piscicultura, lotes, apontamento) e títulos a pagar/receber.
-- Funções rodam como o usuário (security invoker), então o RLS continua valendo.

-- ---------------------------------------------------------------------------
-- Centros de custo criados junto com setor, viveiro e lote
-- ---------------------------------------------------------------------------

create or replace function app.cc_automatico() returns trigger language plpgsql as $$
declare
  v_nome text;
  v_tipo text;
  v_pai uuid;
begin
  if new.centro_custo_id is not null then return new; end if;
  if tg_table_name = 'setores' then
    v_nome := 'Setor ' || new.nome;
    v_tipo := 'setor';
  elsif tg_table_name = 'viveiros' then
    select 'Viveiro ' || n.nome || ' / ' || new.nome, n.centro_custo_id into v_nome, v_pai
    from setores n where n.id = new.setor_id;
    v_tipo := 'viveiro';
  else
    v_nome := 'Lote ' || new.codigo;
    v_tipo := 'lote';
  end if;
  insert into centros_custo (empresa_id, parent_id, nome, tipo)
  values (new.empresa_id, v_pai, v_nome, v_tipo)
  returning id into new.centro_custo_id;
  return new;
end $$;

create trigger setor_cc before insert on setores for each row execute function app.cc_automatico();
create trigger viveiro_cc before insert on viveiros for each row execute function app.cc_automatico();
create trigger lote_cc before insert on lotes for each row execute function app.cc_automatico();

-- Espécies comerciais mais comuns no Brasil (catálogo global, sem curva).
-- A curva padrão vem do manual da espécie e é cadastrada pela piscicultura.
insert into especies (empresa_id, nome, cor_ovo) values
  (null, 'Hy-Line W-36', 'branco'),
  (null, 'Hy-Line W-80', 'branco'),
  (null, 'Hy-Line Brown', 'vermelho'),
  (null, 'Lohmann LSL-Lite', 'branco'),
  (null, 'Lohmann Brown-Lite', 'vermelho'),
  (null, 'Dekalb White', 'branco'),
  (null, 'Dekalb Brown', 'vermelho'),
  (null, 'Novogen White', 'branco'),
  (null, 'Novogen Brown', 'vermelho'),
  (null, 'Hisex White', 'branco'),
  (null, 'Hisex Brown', 'vermelho'),
  (null, 'Bovans White', 'branco'),
  (null, 'ISA Brown', 'vermelho');

-- Piscicultura cria espécie própria (a policy membros de espécies já cobre) e cadastra a curva do manual
create policy membros_escrita on curvas_crescimento for all
  using (exists (select 1 from especies g where g.id = especie_id and g.empresa_id in (select app.minhas_empresas())))
  with check (exists (select 1 from especies g where g.id = especie_id and g.empresa_id in (select app.minhas_empresas())));

-- ---------------------------------------------------------------------------
-- Povoar lote: cria o lote e a alocação no viveiro numa transação
-- ---------------------------------------------------------------------------

create or replace function public.povoar_lote(
  p_empresa uuid,
  p_codigo text,
  p_especie uuid,
  p_nascimento date,
  p_povoamento date,
  p_viveiro uuid,
  p_qtd int,
  p_custo_cents bigint default 0,
  p_fornecedor uuid default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_viveiro viveiros%rowtype;
  v_lote uuid;
  v_fase text;
begin
  select * into v_viveiro from viveiros where id = p_viveiro and empresa_id = p_empresa;
  if not found then
    raise exception 'Viveiro não encontrado nesta empresa' using errcode = 'foreign_key_violation';
  end if;
  if p_qtd > v_viveiro.capacidade_peixes then
    raise exception 'O viveiro % comporta % peixes', v_viveiro.nome, v_viveiro.capacidade_peixes using errcode = 'check_violation';
  end if;
  if not exists (select 1 from especies where id = p_especie and (empresa_id is null or empresa_id = p_empresa)) then
    raise exception 'Espécie não encontrada' using errcode = 'foreign_key_violation';
  end if;

  v_fase := case v_viveiro.finalidade when 'producao' then 'producao' when 'recria' then 'recria' else 'cria' end;

  insert into lotes (empresa_id, codigo, especie_id, data_nascimento, data_povoamento, qtd_povoada,
                     custo_aquisicao_cents, fornecedor_id, fase, inicio_producao)
  values (p_empresa, trim(p_codigo), p_especie, p_nascimento, p_povoamento, p_qtd,
          coalesce(p_custo_cents, 0), p_fornecedor, v_fase,
          case when v_fase = 'producao' then p_povoamento end)
  returning id into v_lote;

  insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo)
  values (p_empresa, v_lote, p_viveiro, p_qtd, daterange(p_povoamento, null), 'povoamento');

  return v_lote;
end $$;

-- ---------------------------------------------------------------------------
-- Apontamento diário: o servidor calcula os peixes do dia e recalcula os dias seguintes
-- ---------------------------------------------------------------------------

create or replace function app.recalcular_peixes(p_lote uuid, p_viveiro uuid, p_desde date) returns void
language plpgsql as $$
begin
  update apontamentos_diarios a set peixes_inicio_dia = x.peixes, updated_at = now()
  from (
    select ap.id,
           al.qtd_peixes - coalesce(sum(ap.mortes + ap.descartes) over (
             partition by ap.lote_id, ap.viveiro_id order by ap.data
             rows between unbounded preceding and 1 preceding), 0) as peixes
    from apontamentos_diarios ap
    join lote_alocacoes al on al.lote_id = ap.lote_id and al.viveiro_id = ap.viveiro_id and al.periodo @> ap.data
    where ap.lote_id = p_lote and ap.viveiro_id = p_viveiro
  ) x
  where a.id = x.id and a.data >= p_desde and a.peixes_inicio_dia is distinct from x.peixes;
end $$;

create or replace function public.registrar_apontamento(
  p_empresa uuid,
  p_lote uuid,
  p_viveiro uuid,
  p_data date,
  p_ovos jsonb,                 -- {"<classe_id>": quantidade, ...}
  p_mortes int default 0,
  p_descartes int default 0,
  p_racao_kg numeric default 0,
  p_agua_l numeric default null,
  p_observacoes text default null,
  p_client_id uuid default null,
  p_origem text default 'web'
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_aloc lote_alocacoes%rowtype;
  v_peixes int;
  v_id uuid;
  v_total int;
begin
  if p_client_id is not null then
    select id into v_id from apontamentos_diarios where client_id = p_client_id;
    if found then return v_id; end if;   -- reenvio do app offline
  end if;

  if p_data > current_date then
    raise exception 'Não dá para apontar uma data futura' using errcode = 'check_violation';
  end if;

  -- sem lote informado, vale o lote que estava no viveiro naquele dia
  select * into v_aloc from lote_alocacoes
  where (p_lote is null or lote_id = p_lote) and viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data;
  if not found then
    if p_lote is null then
      raise exception 'Nenhum lote estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
    raise exception 'O lote não estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  p_lote := v_aloc.lote_id;

  if exists (
    select 1 from jsonb_each_text(coalesce(p_ovos, '{}')) o
    where not exists (select 1 from classes_peixe c where c.id = o.key::uuid and c.empresa_id = p_empresa)
       or o.value::int < 0
  ) then
    raise exception 'Classe de ovo inválida ou quantidade negativa' using errcode = 'check_violation';
  end if;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(coalesce(p_ovos, '{}'));

  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_peixes
  from apontamentos_diarios
  where lote_id = p_lote and viveiro_id = p_viveiro and data < p_data and data >= lower(v_aloc.periodo);

  insert into apontamentos_diarios (empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia, mortes, descartes,
                                    ovos_total, racao_kg, agua_l, observacoes, origem, client_id, created_by)
  values (p_empresa, p_lote, p_viveiro, p_data, v_peixes, coalesce(p_mortes, 0), coalesce(p_descartes, 0),
          v_total, coalesce(p_racao_kg, 0), p_agua_l, nullif(trim(p_observacoes), ''), p_origem, p_client_id, auth.uid())
  on conflict (lote_id, viveiro_id, data) do update set
    peixes_inicio_dia = excluded.peixes_inicio_dia,
    mortes = excluded.mortes,
    descartes = excluded.descartes,
    ovos_total = excluded.ovos_total,
    racao_kg = excluded.racao_kg,
    agua_l = excluded.agua_l,
    observacoes = excluded.observacoes,
    updated_at = now()
  returning id into v_id;

  delete from apontamento_ovos where apontamento_id = v_id;
  insert into apontamento_ovos (apontamento_id, classe_id, quantidade)
  select v_id, key::uuid, value::int from jsonb_each_text(coalesce(p_ovos, '{}')) where value::int > 0;

  perform app.recalcular_peixes(p_lote, p_viveiro, p_data);
  return v_id;
end $$;

-- Quem está em cada viveiro hoje, com os peixes vivos pelo último apontamento.
create view alocacoes_atuais with (security_invoker = true) as
select al.id, al.empresa_id, al.lote_id, al.viveiro_id,
       l.codigo as lote_codigo, l.fase, l.data_nascimento, l.especie_id,
       g.nome as viveiro_nome, n.nome as setor_nome,
       al.qtd_peixes,
       al.qtd_peixes - coalesce(b.baixas, 0) as peixes_atuais,
       ((current_date - l.data_nascimento) / 7 + 1)::int as semana,
       b.ultimo_apontamento
from lote_alocacoes al
join lotes l on l.id = al.lote_id
join viveiros g on g.id = al.viveiro_id
join setores n on n.id = g.setor_id
left join lateral (
  select sum(a.mortes + a.descartes) as baixas, max(a.data) as ultimo_apontamento
  from apontamentos_diarios a
  where a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id and al.periodo @> a.data
) b on true
where al.periodo @> current_date;

-- Indicadores por semana de idade, lado a lado com a curva padrão da espécie.
create view indicadores_lote_semana with (security_invoker = true) as
with dia as (
  select a.empresa_id, a.lote_id, l.especie_id, l.qtd_povoada,
         ((a.data - l.data_nascimento) / 7 + 1)::int as semana,
         a.data, a.peixes_inicio_dia, a.mortes + a.descartes as baixas, a.ovos_total, a.racao_kg
  from apontamentos_diarios a join lotes l on l.id = a.lote_id
), semana as (
  select empresa_id, lote_id, especie_id, qtd_povoada, semana,
         min(data) as inicio, max(data) as fim, count(distinct data) as dias,
         sum(peixes_inicio_dia) as peixes_dia, sum(baixas) as baixas, sum(ovos_total) as ovos, sum(racao_kg) as racao_kg
  from dia group by empresa_id, lote_id, especie_id, qtd_povoada, semana
)
select s.empresa_id, s.lote_id, s.semana, s.inicio, s.fim, s.dias,
       round(s.peixes_dia::numeric / nullif(s.dias, 0)) as peixes_medios,
       s.ovos,
       round(100.0 * s.ovos / nullif(s.peixes_dia, 0), 2) as pct_engorda,
       round(1000.0 * s.racao_kg / nullif(s.peixes_dia, 0), 1) as consumo_g_peixe_dia,
       round(s.racao_kg / nullif(s.ovos / 12.0, 0), 3) as kg_racao_por_duzia,
       s.baixas,
       round(100.0 * sum(s.baixas) over (partition by s.lote_id order by s.semana) / s.qtd_povoada, 2) as mortalidade_acum_pct,
       round(sum(s.ovos) over (partition by s.lote_id order by s.semana)::numeric / s.qtd_povoada, 1) as ovos_peixe_povoada_acum,
       c.pct_engorda as padrao_pct_engorda,
       c.consumo_g_peixe_dia as padrao_consumo_g,
       c.sobrevivencia_pct as padrao_sobrevivencia_pct
from semana s
left join curvas_crescimento c on c.especie_id = s.especie_id and c.semana = s.semana;

-- ---------------------------------------------------------------------------
-- Títulos: agendar com rateio e parcelas numa transação
-- ---------------------------------------------------------------------------

create or replace function public.agendar_titulo(
  p_empresa uuid,
  p_tipo text,
  p_descricao text,
  p_vencimento date,
  p_competencia date,
  p_valor_cents bigint,
  p_rateio jsonb,               -- [{"categoria_id": "...", "centro_custo_id": "..."|null, "valor_cents": 123}]
  p_contato uuid default null,
  p_referencia text default null,
  p_parcelas int default 1,
  p_forma_pagamento text default null
) returns uuid                  -- grupo_parcelamento_id (ou o id do título quando é parcela única)
language plpgsql set search_path = public as $$
declare
  v_sentido text := case p_tipo when 'pagar' then 'saida' when 'receber' then 'entrada' end;
  v_soma bigint;
  v_grupo uuid := gen_random_uuid();
  v_id uuid;
  v_valor_parcela bigint;
  v_n int := coalesce(p_parcelas, 1);
  i int;
  r record;
  v_linhas int;
  v_acumulado bigint;
  v_fatia bigint;
  j int;
begin
  if v_sentido is null then raise exception 'Tipo deve ser pagar ou receber' using errcode = 'check_violation'; end if;
  if v_n < 1 or v_n > 120 then raise exception 'Parcelas entre 1 e 120' using errcode = 'check_violation'; end if;
  if p_valor_cents < v_n then raise exception 'Valor menor que o número de parcelas' using errcode = 'check_violation'; end if;
  if jsonb_typeof(p_rateio) <> 'array' or jsonb_array_length(p_rateio) = 0 then
    raise exception 'Informe ao menos uma categoria' using errcode = 'check_violation';
  end if;

  select sum((x->>'valor_cents')::bigint) into v_soma from jsonb_array_elements(p_rateio) x;
  if v_soma <> p_valor_cents then
    raise exception 'O rateio soma % e o título vale %', v_soma, p_valor_cents using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateio) x
    left join categorias c on c.id = (x->>'categoria_id')::uuid and c.empresa_id = p_empresa
    left join centros_custo cc on cc.id = nullif(x->>'centro_custo_id', '')::uuid and cc.empresa_id = p_empresa
    where c.id is null or c.sentido <> v_sentido or (x->>'valor_cents')::bigint <= 0
       or (nullif(x->>'centro_custo_id', '') is not null and cc.id is null)
  ) then
    raise exception 'Categoria ou centro de custo inválido para um título a %', p_tipo using errcode = 'check_violation';
  end if;

  v_linhas := jsonb_array_length(p_rateio);

  for i in 1..v_n loop
    -- centavos que sobram da divisão ficam na primeira parcela
    v_valor_parcela := p_valor_cents / v_n + case when i = 1 then p_valor_cents % v_n else 0 end;

    insert into agendamentos (empresa_id, tipo, contato_id, descricao, referencia, vencimento, competencia, previsao,
                              valor_cents, forma_pagamento, parcela_numero, parcela_total, grupo_parcelamento_id, created_by)
    values (p_empresa, p_tipo, p_contato, trim(p_descricao), nullif(trim(p_referencia), ''),
            (p_vencimento + make_interval(months => i - 1))::date,
            date_trunc('month', p_competencia)::date,
            (p_vencimento + make_interval(months => i - 1))::date,
            v_valor_parcela, p_forma_pagamento,
            case when v_n > 1 then i end, case when v_n > 1 then v_n end,
            case when v_n > 1 then v_grupo end, auth.uid())
    returning id into v_id;

    -- rateio proporcional em cada parcela; a última linha absorve o arredondamento
    v_acumulado := 0;
    j := 0;
    for r in select x from jsonb_array_elements(p_rateio) x loop
      j := j + 1;
      if j = v_linhas then
        v_fatia := v_valor_parcela - v_acumulado;
      else
        v_fatia := round(v_valor_parcela::numeric * (r.x->>'valor_cents')::bigint / p_valor_cents);
      end if;
      v_acumulado := v_acumulado + v_fatia;
      if v_fatia > 0 then
        insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents)
        values (p_empresa, v_id, (r.x->>'categoria_id')::uuid, nullif(r.x->>'centro_custo_id', '')::uuid, v_fatia);
      end if;
    end loop;
  end loop;

  return case when v_n > 1 then v_grupo else v_id end;
end $$;

-- Baixa não pode passar do saldo nem cair em título cancelado ou perdido.
create or replace function app.valida_baixa() returns trigger language plpgsql as $$
declare
  v_ag agendamentos%rowtype;
  v_pago bigint;
begin
  select * into v_ag from agendamentos where id = new.agendamento_id for update;
  if v_ag.status in ('cancelado', 'perda') then
    raise exception 'Título % não aceita baixa', v_ag.status using errcode = 'check_violation';
  end if;
  if v_ag.empresa_id <> new.empresa_id then
    raise exception 'Título de outra empresa' using errcode = 'check_violation';
  end if;
  select coalesce(sum(valor_cents), 0) into v_pago from baixas
  where agendamento_id = new.agendamento_id and id is distinct from new.id;
  if v_pago + new.valor_cents > v_ag.valor_cents - v_ag.desconto_cents then
    raise exception 'Baixa de % passa do saldo em aberto de %', new.valor_cents, v_ag.valor_cents - v_ag.desconto_cents - v_pago
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger baixa_valida before insert or update on baixas
  for each row execute function app.valida_baixa();

-- Visão de títulos com saldo, para listas e relatórios
create view titulos with (security_invoker = true) as
select a.id, a.empresa_id, a.tipo, a.descricao, a.referencia, a.vencimento, a.competencia, a.previsao,
       a.valor_cents, a.pago_cents, a.valor_cents - a.desconto_cents - a.pago_cents as saldo_cents,
       case when a.status in ('aberto', 'parcial') and a.vencimento < current_date then 'vencido' else a.status end as situacao,
       a.status, a.parcela_numero, a.parcela_total, a.grupo_parcelamento_id, a.forma_pagamento,
       a.contato_id, ct.nome as contato_nome,
       (select string_agg(distinct c.nome, ', ') from agendamento_rateios r join categorias c on c.id = r.categoria_id where r.agendamento_id = a.id) as categorias,
       (select string_agg(distinct cc.nome, ', ') from agendamento_rateios r join centros_custo cc on cc.id = r.centro_custo_id where r.agendamento_id = a.id) as centros_custo
from agendamentos a
left join contatos ct on ct.id = a.contato_id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.povoar_lote(uuid, text, uuid, date, date, uuid, int, bigint, uuid) to authenticated;
    grant execute on function public.registrar_apontamento(uuid, uuid, uuid, date, jsonb, int, int, numeric, numeric, text, uuid, text) to authenticated;
    grant execute on function public.agendar_titulo(uuid, text, text, date, date, bigint, jsonb, uuid, text, int, text) to authenticated;
    grant select on indicadores_lote_semana, titulos, alocacoes_atuais to authenticated;
  end if;
end $$;
