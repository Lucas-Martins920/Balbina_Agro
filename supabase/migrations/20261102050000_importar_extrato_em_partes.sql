-- Importar OFX grande sem estourar o tempo (relato do Nicolas em 2026-11-02: "deu timeout").
--
-- Medido num Postgres local com 3.000 lançamentos e 12 regras (806 casando): a chamada única de
-- importar_extrato levava 34 s, e o Supabase corta a consulta do usuário em 8 s. Dois motivos:
--
-- * a policy de escrita de movimentos_bancarios chamava app.pode_algum para cada linha inserida
--   (permissão, plano, MFA... de novo a cada linha: 2/3 do tempo da inserção). Agora a lista de
--   empresas em que o usuário pode conciliar é calculada uma vez por comando
--   (`empresa_id in (select app.empresas_onde_pode(...))`, o mesmo padrão das policies de leitura);
-- * as regras de conciliação rodavam todas na mesma consulta (~36 ms por lançamento que casa,
--   porque cada um cria título, baixa e conciliação). Agora rodam em partes com tempo limitado:
--   aplicar_regras_lote para depois de p_segundos e devolve onde parou; quem chama continua com
--   novas chamadas, cada uma bem abaixo do limite. importar_extrato aplica o que couber em ~3 s e
--   devolve o ponto de continuação.
--
-- Nada muda no resultado: as mesmas regras, na mesma ordem (data, id), com as mesmas permissões.

-- ---------------------------------------------------------------------------
-- Policies de escrita de movimentos_bancarios: permissão avaliada uma vez por comando
-- ---------------------------------------------------------------------------
drop policy escrita_inserir on movimentos_bancarios;
drop policy escrita_alterar on movimentos_bancarios;
drop policy escrita_apagar on movimentos_bancarios;
create policy escrita_inserir on movimentos_bancarios as restrictive for insert
  with check (empresa_id in (select app.empresas_onde_pode('conciliacao.editar')));
create policy escrita_alterar on movimentos_bancarios as restrictive for update
  using (empresa_id in (select app.empresas_onde_pode('conciliacao.editar')))
  with check (empresa_id in (select app.empresas_onde_pode('conciliacao.editar')));
create policy escrita_apagar on movimentos_bancarios as restrictive for delete
  using (empresa_id in (select app.empresas_onde_pode('conciliacao.editar')));

-- ---------------------------------------------------------------------------
-- Uma regra num lançamento (o miolo do antigo aplicar_regras, sem mudança)
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

-- ---------------------------------------------------------------------------
-- Regras em partes: para depois de p_segundos (null = sem limite) e diz onde parou
-- ---------------------------------------------------------------------------
create or replace function public.aplicar_regras_lote(p_conta uuid, p_importacao uuid default null,
  p_apos_data date default null, p_apos_id uuid default null, p_segundos numeric default 3)
returns jsonb language plpgsql set search_path = public as $$
declare
  m movimentos_bancarios%rowtype;
  v_inicio timestamptz := clock_timestamp();
  v_n int := 0;
begin
  for m in select * from movimentos_bancarios
           where conta_id = p_conta and status = 'pendente' and (p_importacao is null or importacao_id = p_importacao)
             and (p_apos_id is null or (data, id) > (p_apos_data, p_apos_id))
           order by data, id loop
    if app.aplicar_regra_movimento(m) then v_n := v_n + 1; end if;
    if p_segundos is not null and clock_timestamp() - v_inicio >= make_interval(secs => p_segundos::double precision) then
      return jsonb_build_object('aplicadas', v_n, 'fim', false, 'apos_data', m.data, 'apos_id', m.id);
    end if;
  end loop;
  return jsonb_build_object('aplicadas', v_n, 'fim', true);
end $$;

-- Mesma assinatura de antes; aplica tudo de uma vez (uso interno e testes).
create or replace function public.aplicar_regras(p_conta uuid, p_importacao uuid default null) returns int
language sql set search_path = public as $$
  select (public.aplicar_regras_lote(p_conta, p_importacao, null, null, null) ->> 'aplicadas')::int
$$;

-- ---------------------------------------------------------------------------
-- Importação: grava tudo de uma vez e aplica as regras que couberem em ~3 s
-- ---------------------------------------------------------------------------
create or replace function public.importar_extrato(p_conta uuid, p_origem text, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_conta contas_financeiras%rowtype;
  v_inicio timestamptz := clock_timestamp();
  v_imp uuid;
  v_novas int;
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

  with novas as (
    insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents,
                                      cpf_cnpj_contraparte, nome_contraparte, id_externo)
    select v_conta.empresa_id, p_conta, v_imp, (x->>'data')::date, coalesce(nullif(trim(x->>'descricao'), ''), 'Sem descrição'),
           (x->>'valor_cents')::bigint, nullif(regexp_replace(coalesce(x->>'cpf_cnpj', ''), '\D', '', 'g'), ''),
           nullif(trim(x->>'nome'), ''), x->>'id_externo'
    from jsonb_array_elements(p_linhas) x
    where (x->>'valor_cents')::bigint <> 0
    on conflict (conta_id, id_externo) do nothing
    returning 1
  )
  select count(*) into v_novas from novas;

  update importacoes_extrato set linhas_novas = v_novas where id = v_imp;
  v_regras := public.aplicar_regras_lote(p_conta, v_imp, null, null,
    greatest(0, 3 - extract(epoch from clock_timestamp() - v_inicio))::numeric);
  return jsonb_build_object('importacao_id', v_imp, 'total', jsonb_array_length(p_linhas), 'novas', v_novas,
    'por_regra', (v_regras->>'aplicadas')::int, 'regras_fim', (v_regras->>'fim')::boolean,
    'apos_data', v_regras->'apos_data', 'apos_id', v_regras->'apos_id');
end $$;

revoke all on function app.aplicar_regra_movimento(movimentos_bancarios) from public;
revoke all on function public.aplicar_regras_lote(uuid, uuid, date, uuid, numeric) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.aplicar_regra_movimento(movimentos_bancarios) to authenticated;
    grant execute on function public.aplicar_regras_lote(uuid, uuid, date, uuid, numeric) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function app.aplicar_regra_movimento(movimentos_bancarios) to service_role;
    grant execute on function public.aplicar_regras_lote(uuid, uuid, date, uuid, numeric) to service_role;
  end if;
end $$;

select app.travar_referencias();
