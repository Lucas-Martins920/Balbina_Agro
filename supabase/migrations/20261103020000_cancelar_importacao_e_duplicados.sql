-- Cancelar a importação de um extrato lido por engano e nunca lançar em duplicidade
-- (pedido do Nicolas em 2026-11-03: "quero a função cancelar conciliação, para quando é lido o
-- arquivo errado, e quero que sempre seja verificado se aquele lançamento já não está feito").
--
-- 1. cancelar_importacao(importacao, motivo) — só o master, com o código do autenticador de agora:
--    desfaz tudo o que aquele arquivo trouxe. Cada lançamento do arquivo que já foi conciliado é
--    desconciliado (a baixa criada sai e o título volta a aberto; o título criado na conciliação é
--    apagado; pagamento importado ou lançado antes fica), e as linhas do arquivo saem do extrato.
--    O arquivo fica na lista como "cancelado", com o motivo, e o Histórico registra tudo. As linhas
--    NÃO vão para movimentos_apagados: o arquivo certo (ou o mesmo, se foi engano cancelar) entra de novo.
--    Linhas que o arquivo repetia de importações anteriores nunca foram dele e ficam.
--
-- 2. Duplicados na importação. O banco já recusava o mesmo id da transação (FITID do OFX). Agora também
--    pula a linha quando a conta já tem, vindo de outra importação, um lançamento com a mesma data,
--    o mesmo valor e a mesma descrição (alguns bancos mudam o FITID a cada exportação). A comparação
--    conta repetições: dois PIX iguais no mesmo dia continuam dois.
--
-- 3. Lançamento já feito no financeiro. Se o pagamento (ou a transferência) já foi lançado à mão nesta
--    conta e ainda não está ligado ao extrato — mesmo valor, até 5 dias de diferença —, a conciliação
--    mostra "Já lançado" e liga o extrato a ele, sem criar outro. Regras automáticas e "lançar como nas
--    últimas vezes" não criam título novo para esses lançamentos. Desconciliar depois mantém o que já
--    existia (conciliacoes.ja_existia).

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------
alter table importacoes_extrato
  add column linhas_repetidas int not null default 0,
  add column cancelada_em timestamptz,
  add column cancelada_por uuid,
  add column motivo_cancelamento text;

-- a baixa/transferência ligada já existia antes da conciliação (lançada à mão): desconciliar não apaga
alter table conciliacoes add column ja_existia boolean not null default false;

-- Descrição para comparar duplicados: sem acento, minúscula, espaços únicos (números contam).
create or replace function app.chave_extrato(p text) returns text
language sql immutable as $$
  select lower(app.sem_acento(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))))
$$;

-- ---------------------------------------------------------------------------
-- Importação: pula o que já está no extrato (mesmo id ou mesma data+valor+descrição)
-- ---------------------------------------------------------------------------
create or replace function public.importar_extrato(p_conta uuid, p_origem text, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_conta contas_financeiras%rowtype;
  v_inicio timestamptz := clock_timestamp();
  v_imp uuid;
  v_novas int;
  v_repetidas int;
  v_regras jsonb;
begin
  select * into v_conta from contas_financeiras where id = p_conta;
  if not found then raise exception 'Conta não encontrada' using errcode = 'no_data_found'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Extrato sem lançamentos' using errcode = 'check_violation';
  end if;

  insert into importacoes_extrato (empresa_id, conta_id, origem, arquivo_path, periodo_inicio, periodo_fim, total_linhas, created_by)
  select v_conta.empresa_id, p_conta, p_origem, p_arquivo, min((x->>'data')::date), max((x->>'data')::date), count(*), auth.uid()
  from jsonb_array_elements(p_linhas) x
  returning id into v_imp;

  -- Linha repetida: mesma data+valor+descrição que um lançamento de outra importação desta conta. Só contam
  -- os lançamentos que não casaram pelo id com uma linha deste arquivo; a k-ésima linha igual do arquivo
  -- é repetida se a conta já tem k ou mais iguais (dois PIX iguais no mesmo dia continuam dois).
  with linhas as (
    select n, x, (x->>'data')::date as data, (x->>'valor_cents')::bigint as valor,
           app.chave_extrato(coalesce(nullif(trim(x->>'descricao'), ''), 'Sem descrição')) as chave, x->>'id_externo' as id_externo
    from jsonb_array_elements(p_linhas) with ordinality as l(x, n)
    where (x->>'valor_cents')::bigint <> 0
  ),
  sem_id as (
    select l.n, l.data, l.valor, l.chave, row_number() over (partition by l.data, l.valor, l.chave order by l.n) as k
    from linhas l
    where l.id_externo is null
       or not exists (select 1 from movimentos_bancarios mb where mb.conta_id = p_conta and mb.id_externo = l.id_externo)
  ),
  existentes as (
    select mb.data, mb.valor_cents, app.chave_extrato(mb.descricao) as chave, count(*) as qtd
    from movimentos_bancarios mb
    where mb.conta_id = p_conta
      and mb.data between (select min(data) from linhas) and (select max(data) from linhas)
      and (mb.id_externo is null or mb.id_externo not in (select id_externo from linhas where id_externo is not null))
    group by 1, 2, 3
  ),
  marcadas as (
    select l.*, coalesce(s.k <= e.qtd, false) as repetida
    from linhas l
    left join sem_id s on s.n = l.n
    left join existentes e on e.data = s.data and e.valor_cents = s.valor and e.chave = s.chave
  ),
  novas as (
    insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents,
                                      cpf_cnpj_contraparte, nome_contraparte, id_externo)
    select v_conta.empresa_id, p_conta, v_imp, l.data, coalesce(nullif(trim(l.x->>'descricao'), ''), 'Sem descrição'),
           l.valor, nullif(regexp_replace(coalesce(l.x->>'cpf_cnpj', ''), '\D', '', 'g'), ''),
           nullif(trim(l.x->>'nome'), ''), l.id_externo
    from marcadas l
    where not l.repetida
    order by l.n
    on conflict (conta_id, id_externo) do nothing
    returning 1
  )
  select (select count(*) from novas), (select count(*) from marcadas where repetida) into v_novas, v_repetidas;

  update importacoes_extrato set linhas_novas = v_novas, linhas_repetidas = v_repetidas where id = v_imp;
  v_regras := public.aplicar_regras_lote(p_conta, v_imp, null, null,
    greatest(0, 3 - extract(epoch from clock_timestamp() - v_inicio))::numeric);
  return jsonb_build_object('importacao_id', v_imp, 'total', jsonb_array_length(p_linhas), 'novas', v_novas,
    'repetidas', v_repetidas,
    'por_regra', (v_regras->>'aplicadas')::int, 'regras_fim', (v_regras->>'fim')::boolean,
    'apos_data', v_regras->'apos_data', 'apos_id', v_regras->'apos_id');
end $$;

-- ---------------------------------------------------------------------------
-- Já lançado: pagamento ou transferência desta conta, mesmo valor, até 5 dias, sem extrato ligado
-- ---------------------------------------------------------------------------
create or replace function app.ja_lancados(m movimentos_bancarios) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.dist, x.data), '[]'::jsonb)
  from (
    select jsonb_build_object('tipo', 'baixa', 'id', b.id, 'descricao', a.descricao, 'contato_nome', ct.nome,
                              'data', b.data, 'valor_cents', b.valor_cents + b.juros_cents + b.multa_cents - b.desconto_cents) as j,
           abs(b.data - m.data) as dist, b.data
    from baixas b
    join agendamentos a on a.id = b.agendamento_id
    left join contatos ct on ct.id = a.contato_id
    where b.empresa_id = m.empresa_id and b.conta_id = m.conta_id
      and a.tipo = case when m.valor_cents > 0 then 'receber' else 'pagar' end
      and a.status <> 'cancelado'
      and b.valor_cents + b.juros_cents + b.multa_cents - b.desconto_cents = abs(m.valor_cents)
      and abs(b.data - m.data) <= 5
      and not exists (select 1 from conciliacoes c where c.baixa_id = b.id)
    union all
    select jsonb_build_object('tipo', 'transferencia', 'id', t.id, 'descricao', coalesce(t.descricao, 'Transferência'),
                              'contato_nome', cf.nome, 'data', t.data, 'valor_cents', t.valor_cents),
           abs(t.data - m.data), t.data
    from transferencias t
    join contas_financeiras cf on cf.id = case when m.valor_cents < 0 then t.conta_destino_id else t.conta_origem_id end
    where t.empresa_id = m.empresa_id
      and (case when m.valor_cents < 0 then t.conta_origem_id else t.conta_destino_id end) = m.conta_id
      and t.valor_cents = abs(m.valor_cents)
      and abs(t.data - m.data) <= 5
      and not exists (select 1 from conciliacoes c join movimentos_bancarios o on o.id = c.movimento_id
                      where c.transferencia_id = t.id and o.conta_id = m.conta_id)
  ) x
$$;

-- Liga o extrato ao pagamento/transferência que já estava lançado, sem criar nada.
create or replace function public.conciliar_com_existente(p_movimento uuid, p_tipo text, p_id uuid)
returns void language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  v_outra boolean;
begin
  if not exists (select 1 from jsonb_array_elements(app.ja_lancados(v)) j
                 where j->>'tipo' = p_tipo and (j->>'id')::uuid = p_id) then
    raise exception 'Esse lançamento não serve para este extrato (conta, valor ou data diferentes, ou já está conciliado)'
      using errcode = 'check_violation';
  end if;
  if p_tipo = 'baixa' then
    insert into conciliacoes (empresa_id, movimento_id, baixa_id, valor_cents, modo, created_by, ja_existia)
    values (v.empresa_id, v.id, p_id, v.valor_cents, 'manual', auth.uid(), true);
  else
    -- criada pela conciliação da outra perna: segue a regra de sempre (sai quando nenhuma perna ficar)
    v_outra := exists (select 1 from conciliacoes where transferencia_id = p_id);
    insert into conciliacoes (empresa_id, movimento_id, transferencia_id, valor_cents, modo, created_by, ja_existia)
    values (v.empresa_id, v.id, p_id, v.valor_cents, 'manual', auth.uid(), not v_outra);
  end if;
  update movimentos_bancarios set status = 'conciliado' where id = v.id;
end $$;

-- ---------------------------------------------------------------------------
-- Desconciliar mantém o que já existia antes da conciliação
-- ---------------------------------------------------------------------------
create or replace function app.soltar_conciliacao(p_movimento uuid, p_forcar boolean, p_manter_titulo boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  c record;
  v_desc text;
  v_feito text[] := '{}';
  n int;
begin
  select * into v from movimentos_bancarios where id = p_movimento for update;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  if exists (select 1 from periodos_fechados where empresa_id = v.empresa_id and mes = date_trunc('month', v.data)::date) then
    raise exception 'Mês % está fechado: reabra o mês para mexer neste lançamento', to_char(v.data, 'MM/YYYY') using errcode = 'check_violation';
  end if;

  if v.status = 'ignorado' then
    v_feito := v_feito || 'lançamento ignorado voltou para conciliar'::text;
  end if;

  for c in select * from conciliacoes where movimento_id = p_movimento loop
    delete from conciliacoes where id = c.id;
    if c.baixa_id is not null then
      select coalesce(a.descricao, 'título') into v_desc from baixas b join agendamentos a on a.id = b.agendamento_id where b.id = c.baixa_id;
      if p_forcar or not (c.ja_existia or app.veio_de_importacao(v.empresa_id, 'baixa', c.baixa_id)) then
        delete from baixas where id = c.baixa_id;
        v_feito := v_feito || format('baixa de "%s" apagada', v_desc);
      elsif c.ja_existia then
        v_feito := v_feito || format('pagamento de "%s" lançado antes mantido', v_desc);
      else
        v_feito := v_feito || format('baixa importada de "%s" mantida', v_desc);
      end if;
    elsif p_forcar then
      -- as outras pernas perdem a transferência: voltam para conciliar
      update movimentos_bancarios set status = 'pendente'
      where id in (select movimento_id from conciliacoes where transferencia_id = c.transferencia_id);
      delete from transferencias where id = c.transferencia_id;
      v_feito := v_feito || 'transferência apagada'::text;
    elsif not c.ja_existia
          and not exists (select 1 from conciliacoes where transferencia_id = c.transferencia_id)
          and not app.veio_de_importacao(v.empresa_id, 'transferencia', c.transferencia_id) then
      delete from transferencias where id = c.transferencia_id;
      v_feito := v_feito || 'transferência apagada'::text;
    elsif c.ja_existia then
      v_feito := v_feito || 'transferência lançada antes mantida'::text;
    else
      v_feito := v_feito || 'transferência mantida (a outra conta segue conciliada nela)'::text;
    end if;
  end loop;

  -- título criado na própria conciliação (sem outro pagamento)
  if p_forcar then
    delete from agendamentos a where a.origem = 'conciliacao' and a.origem_id = p_movimento
      and not exists (select 1 from baixas b where b.agendamento_id = a.id);
    get diagnostics n = row_count;
    if n > 0 then v_feito := v_feito || 'título criado na conciliação apagado'::text; end if;
  elsif not coalesce(p_manter_titulo, false) then
    update agendamentos set status = 'cancelado', updated_at = now()
    where origem = 'conciliacao' and origem_id = p_movimento and pago_cents = 0 and status <> 'cancelado';
    get diagnostics n = row_count;
    if n > 0 then v_feito := v_feito || 'título criado na conciliação cancelado'::text; end if;
  else
    perform 1 from agendamentos where origem = 'conciliacao' and origem_id = p_movimento and status in ('aberto', 'parcial');
    if found then v_feito := v_feito || 'título criado na conciliação ficou em aberto'::text; end if;
  end if;

  update movimentos_bancarios set status = 'pendente' where id = p_movimento and status <> 'pendente';
  return v_feito;
end $$;

-- ---------------------------------------------------------------------------
-- Cancelar a importação de um arquivo
-- ---------------------------------------------------------------------------
create or replace function public.cancelar_importacao(p_importacao uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i importacoes_extrato%rowtype;
  v_motivo text := app.motivo_valido(p_motivo);
  m record;
  v_feito text[];
  v_desconciliados int := 0;
  v_titulos int := 0;
  v_mantidos int := 0;
  v_apagados int;
  v_mes text;
  n int;
begin
  select * into i from importacoes_extrato where id = p_importacao for update;
  if not found then raise exception 'Importação não encontrada' using errcode = 'no_data_found'; end if;
  perform app.exigir_master_com_codigo(i.empresa_id, 'cancelar a importação de um extrato');
  if i.cancelada_em is not null then
    raise exception 'Esta importação já foi cancelada' using errcode = 'check_violation';
  end if;
  if i.origem = 'open_finance' then
    raise exception 'Leitura do Open Finance não se cancela: o banco manda de novo na próxima leitura. Ignore ou apague os lançamentos um a um'
      using errcode = 'check_violation';
  end if;
  select to_char(min(mb.data), 'MM/YYYY') into v_mes from movimentos_bancarios mb
  where mb.importacao_id = i.id
    and exists (select 1 from periodos_fechados pf where pf.empresa_id = i.empresa_id and pf.mes = date_trunc('month', mb.data)::date);
  if v_mes is not null then
    raise exception 'Mês % está fechado: reabra o mês para cancelar esta importação', v_mes using errcode = 'check_violation';
  end if;

  for m in select id from movimentos_bancarios where importacao_id = i.id and status <> 'pendente' order by data, id loop
    v_feito := app.soltar_conciliacao(m.id, false, true);
    v_desconciliados := v_desconciliados + 1;
    -- título criado na conciliação: sai junto, se ninguém pagou nada nele depois
    delete from agendamentos a where a.origem = 'conciliacao' and a.origem_id = m.id
      and not exists (select 1 from baixas b where b.agendamento_id = a.id);
    get diagnostics n = row_count;
    v_titulos := v_titulos + n;
    v_mantidos := v_mantidos + (select count(*) from unnest(v_feito) f where f like '%mantid%');
  end loop;

  delete from movimentos_bancarios where importacao_id = i.id;
  get diagnostics v_apagados = row_count;

  update importacoes_extrato
  set cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = v_motivo
  where id = i.id;

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, antes)
  values (i.empresa_id, auth.uid(),
          coalesce((select lower(email) from auth.users where id = auth.uid()), auth.uid()::text),
          'importacao_extrato', i.id::text, 'delete',
          format('Cancelou a importação %s (%s a %s): %s lançamento(s) do extrato apagados, %s desconciliado(s), %s título(s) criados na conciliação apagados%s. Motivo: %s.',
                 coalesce(i.arquivo_path, i.origem), to_char(i.periodo_inicio, 'DD/MM/YYYY'), to_char(i.periodo_fim, 'DD/MM/YYYY'),
                 v_apagados, v_desconciliados, v_titulos,
                 case when v_mantidos > 0 then format(', %s pagamento(s) lançado(s) antes ou importado(s) mantido(s)', v_mantidos) else '' end,
                 v_motivo),
          to_jsonb(i));

  return jsonb_build_object('apagados', v_apagados, 'desconciliados', v_desconciliados, 'titulos_apagados', v_titulos,
                            'mantidos', v_mantidos);
end $$;

-- ---------------------------------------------------------------------------
-- Regras e "lançar como nas últimas vezes" não criam título para o que já foi lançado
-- ---------------------------------------------------------------------------
create or replace function app.aplicar_regra_movimento(m movimentos_bancarios) returns boolean
language plpgsql set search_path = public as $$
declare
  r regras_conciliacao%rowtype;
  v_titulo uuid;
  v_sentido text;
begin
  select * into r from regras_conciliacao x
  where x.empresa_id = m.empresa_id and app.regra_casa(x, m)
  order by case x.tipo when 'ignorar' then 0 when 'transferencia' then 2 else 1 end, x.ordem
  limit 1;
  if not found then return false; end if;

  if r.tipo = 'ignorar' then
    update movimentos_bancarios set status = 'ignorado', regra_aplicada_id = r.id where id = m.id;
    return true;
  end if;

  -- já lançado à mão: fica para a pessoa confirmar em "Já lançado"
  if app.ja_lancados(m) <> '[]'::jsonb then return false; end if;

  v_sentido := case when m.valor_cents > 0 then 'entrada' else 'saida' end;
  if r.tipo = 'transferencia' then
    if r.acao_contrapartida_conta_id = m.conta_id then return false; end if;
    perform public.conciliar_transferencia(m.id, r.acao_contrapartida_conta_id);
  elsif r.acao_categoria_id is not null then
    if not exists (select 1 from categorias where id = r.acao_categoria_id and sentido = v_sentido) then return false; end if;
    perform public.conciliar_criando_titulo(m.id, r.acao_categoria_id, r.acao_centro_custo_id, r.acao_contato_id,
                                            coalesce(r.acao_descricao, m.descricao));
  else
    select t.id into v_titulo from titulos t
    where t.empresa_id = m.empresa_id and t.contato_id = r.acao_contato_id
      and t.tipo = case when m.valor_cents > 0 then 'receber' else 'pagar' end
      and t.status in ('aberto', 'parcial') and t.saldo_cents = abs(m.valor_cents)
    order by abs(t.vencimento - m.data)
    limit 1;
    if v_titulo is null then return false; end if;
    perform public.conciliar_com_titulo(m.id, v_titulo, 'regra');
  end if;

  update conciliacoes set modo = 'regra' where movimento_id = m.id;
  update movimentos_bancarios set regra_aplicada_id = r.id where id = m.id;
  return true;
end $$;

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
    and app.ja_lancados(m) = '[]'::jsonb
  order by m.data, m.id
  limit 200
$$;

-- Painel: ganha ja_lancados; com algo já lançado não há "certeira" (a pessoa escolhe).
drop function public.painel_conciliacao(uuid, int);
create function public.painel_conciliacao(p_conta uuid, p_limite int default 50)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint, nome_contraparte text, cpf_cnpj_contraparte text,
               sugestoes jsonb, palpite jsonb, transferencia jsonb, certeira uuid, ja_lancados jsonb)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, m.nome_contraparte, m.cpf_cnpj_contraparte,
         s.lista, p.palpite, t.transferencia,
         case when j.lista = '[]'::jsonb
                   and (s.lista->0->>'pontos')::int >= 70
                   and (s.lista->0->>'saldo_cents')::bigint = abs(m.valor_cents)
                   and coalesce((s.lista->1->>'pontos')::int, 0) < (s.lista->0->>'pontos')::int - 10
              then (s.lista->0->>'agendamento_id')::uuid end,
         j.lista
  from movimentos_bancarios m
  cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.pontos desc, abs(x.vencimento - m.data)), '[]'::jsonb) as lista
    from public.sugestoes_conciliacao(m.id) x
  ) s
  cross join lateral (select app.ja_lancados(m) as lista) j
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

revoke all on function public.cancelar_importacao(uuid, text) from public;
revoke all on function public.conciliar_com_existente(uuid, text, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.chave_extrato(text) to authenticated;
    grant execute on function app.ja_lancados(movimentos_bancarios) to authenticated;
    grant execute on function public.cancelar_importacao(uuid, text) to authenticated;
    grant execute on function public.conciliar_com_existente(uuid, text, uuid) to authenticated;
    grant execute on function public.painel_conciliacao(uuid, int) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function app.chave_extrato(text) to service_role;
    grant execute on function app.ja_lancados(movimentos_bancarios) to service_role;
    grant execute on function public.painel_conciliacao(uuid, int) to service_role;
  end if;
end $$;

select app.travar_referencias();
