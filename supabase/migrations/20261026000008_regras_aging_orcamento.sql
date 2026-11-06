-- Marco 5a: regras de conciliação automática, aging de títulos e orçamento × realizado.

-- ---------------------------------------------------------------------------
-- Regras de conciliação
-- ---------------------------------------------------------------------------

-- Uma condição: {campo: cpf_cnpj|descricao|valor, operador: igual|comeca_com|contem|vazio|maior|menor, valor}
-- Texto compara sem diferenciar maiúsculas; valor compara em reais, pelo módulo.
create or replace function app.condicao_casa(p_cond jsonb, m movimentos_bancarios) returns boolean
language plpgsql immutable as $$
declare
  v_campo text := p_cond->>'campo';
  v_op text := p_cond->>'operador';
  v_alvo text := lower(trim(coalesce(p_cond->>'valor', '')));
  v_texto text;
  v_num numeric;
begin
  if v_campo = 'valor' then
    v_num := abs(m.valor_cents) / 100.0;
    return case v_op
      when 'igual' then v_num = replace(v_alvo, ',', '.')::numeric
      when 'maior' then v_num > replace(v_alvo, ',', '.')::numeric
      when 'menor' then v_num < replace(v_alvo, ',', '.')::numeric
      else false end;
  end if;

  v_texto := lower(coalesce(case v_campo when 'cpf_cnpj' then m.cpf_cnpj_contraparte when 'descricao' then m.descricao end, ''));
  if v_campo = 'cpf_cnpj' then v_alvo := regexp_replace(v_alvo, '\D', '', 'g'); end if;
  return case v_op
    when 'vazio' then v_texto = ''
    when 'igual' then v_texto = v_alvo
    when 'comeca_com' then v_alvo <> '' and starts_with(v_texto, v_alvo)
    when 'contem' then v_alvo <> '' and position(v_alvo in v_texto) > 0
    else false end;
exception when invalid_text_representation then
  return false;  -- valor digitado que não é número: a condição simplesmente não casa
end $$;

create or replace function app.regra_casa(r regras_conciliacao, m movimentos_bancarios) returns boolean
language sql immutable as $$
  select r.ativa
     and (r.contas is null or m.conta_id = any (r.contas))
     and case r.tipo when 'recebimento' then m.valor_cents > 0 when 'pagamento' then m.valor_cents < 0 else true end
     and case r.operador_logico
           when 'todas' then (select bool_and(app.condicao_casa(c, m)) from jsonb_array_elements(r.condicoes) c)
           else (select bool_or(app.condicao_casa(c, m)) from jsonb_array_elements(r.condicoes) c) end
$$;

-- Aplica a primeira regra que casar a cada lançamento pendente da conta.
-- Regra com categoria cria o título já baixado; regra só com contato procura um título dele com o mesmo valor.
-- Lançamento que a regra não consegue resolver continua pendente para conciliação manual.
create or replace function public.aplicar_regras(p_conta uuid, p_importacao uuid default null) returns int
language plpgsql set search_path = public as $$
declare
  m movimentos_bancarios%rowtype;
  r regras_conciliacao%rowtype;
  v_titulo uuid;
  v_n int := 0;
  v_sentido text;
begin
  for m in select * from movimentos_bancarios
           where conta_id = p_conta and status = 'pendente' and (p_importacao is null or importacao_id = p_importacao)
           order by data, id loop
    select * into r from regras_conciliacao x
    where x.empresa_id = m.empresa_id and app.regra_casa(x, m)
    order by case x.tipo when 'transferencia' then 1 else 0 end, x.ordem
    limit 1;
    continue when not found;

    v_sentido := case when m.valor_cents > 0 then 'entrada' else 'saida' end;
    if r.tipo = 'transferencia' then
      continue when r.acao_contrapartida_conta_id = m.conta_id;
      perform public.conciliar_transferencia(m.id, r.acao_contrapartida_conta_id);
    elsif r.acao_categoria_id is not null then
      continue when not exists (select 1 from categorias where id = r.acao_categoria_id and sentido = v_sentido);
      perform public.conciliar_criando_titulo(m.id, r.acao_categoria_id, r.acao_centro_custo_id, r.acao_contato_id,
                                              coalesce(r.acao_descricao, m.descricao));
    else
      select t.id into v_titulo from titulos t
      where t.empresa_id = m.empresa_id and t.contato_id = r.acao_contato_id
        and t.tipo = case when m.valor_cents > 0 then 'receber' else 'pagar' end
        and t.status in ('aberto', 'parcial') and t.saldo_cents = abs(m.valor_cents)
      order by abs(t.vencimento - m.data)
      limit 1;
      continue when v_titulo is null;
      perform public.conciliar_com_titulo(m.id, v_titulo, 'regra');
    end if;

    update conciliacoes set modo = 'regra' where movimento_id = m.id;
    update movimentos_bancarios set regra_aplicada_id = r.id where id = m.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Cria a regra no fim da fila do seu tipo.
create or replace function public.criar_regra(
  p_empresa uuid,
  p_tipo text,
  p_nome text,
  p_condicoes jsonb,
  p_operador text default 'todas',
  p_categoria uuid default null,
  p_centro_custo uuid default null,
  p_contato uuid default null,
  p_descricao text default null,
  p_contrapartida uuid default null,
  p_contas uuid[] default null
) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if p_categoria is not null and not exists (
    select 1 from categorias where id = p_categoria and empresa_id = p_empresa
      and sentido = case p_tipo when 'recebimento' then 'entrada' else 'saida' end) then
    raise exception 'A categoria não combina com o tipo da regra' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('regras:' || p_empresa));
  insert into regras_conciliacao (empresa_id, tipo, nome, ordem, contas, operador_logico, condicoes,
                                  acao_contato_id, acao_categoria_id, acao_centro_custo_id, acao_descricao, acao_contrapartida_conta_id)
  values (p_empresa, p_tipo, trim(p_nome),
          coalesce((select max(ordem) from regras_conciliacao where empresa_id = p_empresa and tipo = p_tipo), 0) + 1,
          p_contas, p_operador, p_condicoes, p_contato, p_categoria, p_centro_custo, nullif(trim(p_descricao), ''), p_contrapartida)
  returning id into v_id;
  return v_id;
end $$;

-- Troca a regra de lugar com a vizinha (para cima ou para baixo) na fila do mesmo tipo.
create or replace function public.mover_regra(p_regra uuid, p_para_cima boolean) returns void
language plpgsql set search_path = public as $$
declare
  r regras_conciliacao%rowtype;
  v regras_conciliacao%rowtype;
begin
  select * into r from regras_conciliacao where id = p_regra;
  if not found then raise exception 'Regra não encontrada' using errcode = 'no_data_found'; end if;
  select * into v from regras_conciliacao
  where empresa_id = r.empresa_id and tipo = r.tipo
    and case when p_para_cima then ordem < r.ordem else ordem > r.ordem end
  order by case when p_para_cima then -ordem else ordem end
  limit 1;
  if not found then return; end if;
  update regras_conciliacao set ordem = v.ordem, updated_at = now() where id = r.id;
  update regras_conciliacao set ordem = r.ordem, updated_at = now() where id = v.id;
end $$;

-- A importação passa a aplicar as regras logo depois de gravar as linhas novas.
create or replace function public.importar_extrato(p_conta uuid, p_origem text, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_conta contas_financeiras%rowtype;
  v_imp uuid;
  v_novas int;
  v_regras int;
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
  v_regras := public.aplicar_regras(p_conta, v_imp);
  return jsonb_build_object('importacao_id', v_imp, 'total', jsonb_array_length(p_linhas), 'novas', v_novas, 'por_regra', v_regras);
end $$;

-- ---------------------------------------------------------------------------
-- Aging: saldo em aberto por faixa de atraso
-- ---------------------------------------------------------------------------

create view aging_titulos with (security_invoker = true) as
select empresa_id, tipo, id as agendamento_id, contato_id, coalesce(contato_nome, 'Sem contato') as contato_nome,
       descricao, vencimento, saldo_cents, greatest(current_date - vencimento, 0) as dias_atraso,
       case
         when vencimento >= current_date then 'a_vencer'
         when current_date - vencimento <= 30 then 'ate_30'
         when current_date - vencimento <= 60 then 'ate_60'
         when current_date - vencimento <= 90 then 'ate_90'
         else 'mais_90' end as faixa
from titulos
where status in ('aberto', 'parcial') and saldo_cents > 0;

-- ---------------------------------------------------------------------------
-- Orçamento
-- ---------------------------------------------------------------------------

-- p_valores: 12 valores em centavos, de janeiro a dezembro. Zeros apagam o mês.
create or replace function public.salvar_orcamento(p_empresa uuid, p_ano int, p_categoria uuid, p_valores jsonb,
                                                   p_centro_custo uuid default null) returns void
language plpgsql set search_path = public as $$
declare i int;
begin
  if jsonb_typeof(p_valores) <> 'array' or jsonb_array_length(p_valores) <> 12 then
    raise exception 'Informe os 12 meses' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from categorias where id = p_categoria and empresa_id = p_empresa) then
    raise exception 'Categoria inválida' using errcode = 'check_violation';
  end if;
  for i in 1..12 loop
    if coalesce((p_valores->>(i - 1))::bigint, 0) = 0 then
      delete from orcamentos where empresa_id = p_empresa and ano = p_ano and categoria_id = p_categoria and mes = i
        and centro_custo_id is not distinct from p_centro_custo;
    else
      insert into orcamentos (empresa_id, ano, centro_custo_id, categoria_id, mes, valor_cents)
      values (p_empresa, p_ano, p_centro_custo, p_categoria, i, (p_valores->>(i - 1))::bigint)
      on conflict (empresa_id, ano, coalesce(centro_custo_id, '00000000-0000-0000-0000-000000000000'::uuid), categoria_id, mes)
      do update set valor_cents = excluded.valor_cents, updated_at = now();
    end if;
  end loop;
end $$;

-- Ponto de partida: o realizado (competência) do ano anterior, reajustado. Não mexe no que já foi orçado.
create or replace function public.orcamento_do_realizado(p_empresa uuid, p_ano int, p_reajuste_pct numeric default 0) returns int
language plpgsql set search_path = public as $$
declare v_n int;
begin
  insert into orcamentos (empresa_id, ano, centro_custo_id, categoria_id, mes, valor_cents)
  select p_empresa, p_ano, null, r.categoria_id, extract(month from r.mes)::int,
         round(sum(r.valor_cents) * (1 + p_reajuste_pct / 100))::bigint
  from resultado_competencia r
  where r.empresa_id = p_empresa and extract(year from r.mes) = p_ano - 1
  group by r.categoria_id, extract(month from r.mes)
  having sum(r.valor_cents) <> 0
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Orçado × realizado por categoria e mês, em regime de competência (valores positivos nos dois sentidos).
create view orcado_realizado with (security_invoker = true) as
with orc as (
  select empresa_id, make_date(ano, mes, 1) as mes, categoria_id, sum(valor_cents)::bigint as orcado_cents
  from orcamentos group by 1, 2, 3
), real as (
  select empresa_id, mes, categoria_id, sum(valor_cents)::bigint as realizado_cents
  from resultado_competencia group by 1, 2, 3
)
select coalesce(o.empresa_id, r.empresa_id) as empresa_id, coalesce(o.mes, r.mes) as mes,
       coalesce(o.categoria_id, r.categoria_id) as categoria_id, c.nome as categoria, c.grupo, c.sentido,
       coalesce(o.orcado_cents, 0) as orcado_cents, coalesce(r.realizado_cents, 0) as realizado_cents
from orc o
full join real r on r.empresa_id = o.empresa_id and r.mes = o.mes and r.categoria_id = o.categoria_id
join categorias c on c.id = coalesce(o.categoria_id, r.categoria_id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.aplicar_regras(uuid, uuid) to authenticated;
    grant execute on function public.criar_regra(uuid, text, text, jsonb, text, uuid, uuid, uuid, text, uuid, uuid[]) to authenticated;
    grant execute on function public.mover_regra(uuid, boolean) to authenticated;
    grant execute on function public.salvar_orcamento(uuid, int, uuid, jsonb, uuid) to authenticated;
    grant execute on function public.orcamento_do_realizado(uuid, int, numeric) to authenticated;
    grant select on aging_titulos, orcado_realizado to authenticated;
  end if;
end $$;
