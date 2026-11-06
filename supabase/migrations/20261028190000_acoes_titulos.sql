-- Ações rápidas nas contas a pagar e a receber, no jeito do NIBO: editar, duplicar, baixar em lote,
-- reprogramar vencimento, excluir para a lixeira e restaurar, marcar perda e estornar baixa.
-- Todas são security invoker: o RLS de agendamentos/baixas (app.pode_titulo_tipo) decide quem pode.

-- Recusa logo, com mensagem clara, se algum título não for da alçada do usuário (sem isso o RLS só ignoraria).
create or replace function app.exige_pode_titulos(p_titulos uuid[]) returns void
language plpgsql stable set search_path = public as $$
begin
  if exists (select 1 from unnest(p_titulos) x where not app.pode_titulo(x)) then
    raise exception 'Seu usuário não tem permissão para alterar estes títulos' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Editar os dados do título. O valor só muda sem baixa e com rateio de uma linha só.
create or replace function public.editar_titulo(
  p_titulo uuid, p_descricao text, p_vencimento date, p_competencia date, p_contato uuid,
  p_referencia text, p_forma_pagamento text, p_valor_cents bigint
) returns void
language plpgsql set search_path = public as $$
declare
  a agendamentos%rowtype;
  n_rateio int;
begin
  perform app.exige_pode_titulos(array[p_titulo]);
  select * into a from agendamentos where id = p_titulo for update;
  if not found then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if a.status in ('cancelado', 'perda') then
    raise exception 'Restaure o título antes de editar' using errcode = 'check_violation';
  end if;
  if nullif(trim(p_descricao), '') is null then raise exception 'Informe a descrição' using errcode = 'check_violation'; end if;

  if p_valor_cents is not null and p_valor_cents <> a.valor_cents then
    if a.pago_cents > 0 then
      raise exception 'Estorne a baixa antes de mudar o valor' using errcode = 'check_violation';
    end if;
    select count(*) into n_rateio from agendamento_rateios where agendamento_id = a.id;
    if n_rateio > 1 then
      raise exception 'Título com rateio em várias categorias: exclua e lance de novo para mudar o valor' using errcode = 'check_violation';
    end if;
    if p_valor_cents <= a.desconto_cents then
      raise exception 'Valor precisa ser maior que o desconto' using errcode = 'check_violation';
    end if;
    update agendamento_rateios set valor_cents = p_valor_cents where agendamento_id = a.id;
  end if;

  update agendamentos set
    descricao = trim(p_descricao),
    vencimento = coalesce(p_vencimento, vencimento),
    previsao = case when previsao = vencimento then coalesce(p_vencimento, vencimento) else previsao end,
    competencia = coalesce(date_trunc('month', p_competencia)::date, competencia),
    contato_id = p_contato,
    referencia = nullif(trim(coalesce(p_referencia, '')), ''),
    forma_pagamento = nullif(p_forma_pagamento, ''),
    valor_cents = coalesce(p_valor_cents, valor_cents),
    updated_at = now()
  where id = a.id;
end $$;

-- Copia o título (com o rateio) para um novo vencimento. A competência anda junto com o vencimento.
create or replace function public.duplicar_titulo(p_titulo uuid, p_vencimento date) returns uuid
language plpgsql set search_path = public as $$
declare
  a agendamentos%rowtype;
  v_id uuid;
  v_meses int;
begin
  select * into a from agendamentos where id = p_titulo;
  if not found then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if p_vencimento is null then raise exception 'Informe o vencimento da cópia' using errcode = 'check_violation'; end if;
  v_meses := (extract(year from age(date_trunc('month', a.competencia), date_trunc('month', a.vencimento))) * 12
            + extract(month from age(date_trunc('month', a.competencia), date_trunc('month', a.vencimento))))::int;

  insert into agendamentos (empresa_id, tipo, contato_id, descricao, referencia, vencimento, competencia, previsao,
                            valor_cents, desconto_cents, forma_pagamento, origem, created_by)
  values (a.empresa_id, a.tipo, a.contato_id, a.descricao, a.referencia, p_vencimento,
          (date_trunc('month', p_vencimento) + make_interval(months => v_meses))::date, p_vencimento,
          a.valor_cents, a.desconto_cents, a.forma_pagamento, 'manual', auth.uid())
  returning id into v_id;

  insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents)
  select empresa_id, v_id, categoria_id, centro_custo_id, valor_cents from agendamento_rateios where agendamento_id = a.id;
  return v_id;
end $$;

-- Baixa total de vários títulos de uma vez, na mesma conta e data. Ignora o que não tem saldo.
create or replace function public.baixar_titulos(p_titulos uuid[], p_conta uuid, p_data date) returns int
language plpgsql set search_path = public as $$
declare
  t record;
  n int := 0;
begin
  perform app.exige_pode_titulos(p_titulos);
  if p_conta is null or p_data is null then raise exception 'Informe conta e data' using errcode = 'check_violation'; end if;
  for t in select a.id, a.empresa_id, a.valor_cents - a.desconto_cents - a.pago_cents as saldo
           from agendamentos a where a.id = any(p_titulos) and a.status in ('aberto', 'parcial') order by a.vencimento
  loop
    continue when t.saldo <= 0;
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, created_by)
    values (t.empresa_id, t.id, p_conta, p_data, t.saldo, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

-- Novo vencimento para vários títulos em aberto.
create or replace function public.reprogramar_titulos(p_titulos uuid[], p_vencimento date) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  perform app.exige_pode_titulos(p_titulos);
  if p_vencimento is null then raise exception 'Informe o novo vencimento' using errcode = 'check_violation'; end if;
  update agendamentos set vencimento = p_vencimento,
         previsao = case when previsao = vencimento then p_vencimento else previsao end, updated_at = now()
  where id = any(p_titulos) and status in ('aberto', 'parcial');
  get diagnostics n = row_count;
  return n;
end $$;

-- Excluir manda para a lixeira (status cancelado), de onde dá para restaurar.
create or replace function public.excluir_titulos(p_titulos uuid[]) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  perform app.exige_pode_titulos(p_titulos);
  if exists (select 1 from agendamentos where id = any(p_titulos) and status <> 'cancelado' and pago_cents > 0) then
    raise exception 'Há título com pagamento registrado: estorne a baixa antes de excluir' using errcode = 'check_violation';
  end if;
  if exists (select 1 from agendamentos where id = any(p_titulos) and status <> 'cancelado' and origem = 'pedido_venda') then
    raise exception 'Título de venda: cancele a venda em Vendas' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cobrancas where agendamento_id = any(p_titulos) and status in ('processando', 'emitida', 'visualizada')) then
    raise exception 'Há título com cobrança em aberto: cancele a cobrança antes' using errcode = 'check_violation';
  end if;
  update agendamentos set status = 'cancelado', updated_at = now()
  where id = any(p_titulos) and status <> 'cancelado';
  get diagnostics n = row_count;
  return n;
end $$;

-- Tira da lixeira ou da perda: volta a aberto, parcial ou quitado conforme o que já foi pago.
-- Título de venda cancelada continua cancelado (a venda é que manda nele).
create or replace function public.restaurar_titulos(p_titulos uuid[]) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  perform app.exige_pode_titulos(p_titulos);
  update agendamentos set status = case
      when pago_cents = 0 then 'aberto'
      when pago_cents < valor_cents - desconto_cents then 'parcial'
      else 'quitado' end,
    updated_at = now()
  where id = any(p_titulos) and status in ('cancelado', 'perda') and origem <> 'pedido_venda';
  get diagnostics n = row_count;
  return n;
end $$;

-- Recebimento que não vai entrar: sai do em aberto sem virar caixa.
create or replace function public.marcar_perda(p_titulos uuid[]) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  perform app.exige_pode_titulos(p_titulos);
  if exists (select 1 from agendamentos where id = any(p_titulos) and tipo <> 'receber') then
    raise exception 'Só contas a receber podem virar perda' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cobrancas where agendamento_id = any(p_titulos) and status in ('processando', 'emitida', 'visualizada')) then
    raise exception 'Há título com cobrança em aberto: cancele a cobrança antes' using errcode = 'check_violation';
  end if;
  update agendamentos set status = 'perda', updated_at = now()
  where id = any(p_titulos) and status in ('aberto', 'parcial');
  get diagnostics n = row_count;
  return n;
end $$;

-- Desfaz os pagamentos do título. Baixa já conciliada com o extrato fica: desfaça a conciliação primeiro.
create or replace function public.estornar_baixas(p_titulo uuid) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  perform app.exige_pode_titulos(array[p_titulo]);
  if exists (select 1 from baixas b join conciliacoes c on c.baixa_id = b.id where b.agendamento_id = p_titulo) then
    raise exception 'Pagamento conciliado com o extrato: desfaça a conciliação antes' using errcode = 'check_violation';
  end if;
  delete from baixas where agendamento_id = p_titulo;
  get diagnostics n = row_count;
  return n;
end $$;

-- A lista mostra o ↻ das recorrências e esconde ações que não cabem em título de venda.
create or replace view public.titulos with (security_invoker = true) as  SELECT a.id,
    a.empresa_id,
    a.tipo,
    a.descricao,
    a.referencia,
    a.vencimento,
    a.competencia,
    a.previsao,
    a.valor_cents,
    a.pago_cents,
    a.valor_cents - a.desconto_cents - a.pago_cents AS saldo_cents,
        CASE
            WHEN (a.status = ANY (ARRAY['aberto'::text, 'parcial'::text])) AND a.vencimento < app.hoje(a.empresa_id) THEN 'vencido'::text
            ELSE a.status
        END AS situacao,
    a.status,
    a.parcela_numero,
    a.parcela_total,
    a.grupo_parcelamento_id,
    a.forma_pagamento,
    a.contato_id,
    ct.nome AS contato_nome,
    ( SELECT string_agg(DISTINCT c.nome, ', '::text) AS string_agg
           FROM agendamento_rateios r
             JOIN categorias c ON c.id = r.categoria_id
          WHERE r.agendamento_id = a.id) AS categorias,
    ( SELECT string_agg(DISTINCT cc.nome, ', '::text) AS string_agg
           FROM agendamento_rateios r
             JOIN centros_custo cc ON cc.id = r.centro_custo_id
          WHERE r.agendamento_id = a.id) AS centros_custo,
    a.recorrencia_id,
    a.origem
   FROM agendamentos a
     LEFT JOIN contatos ct ON ct.id = a.contato_id;


do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.exige_pode_titulos(uuid[]) to authenticated;
    revoke all on function public.editar_titulo(uuid, text, date, date, uuid, text, text, bigint) from public;
    revoke all on function public.duplicar_titulo(uuid, date) from public;
    revoke all on function public.baixar_titulos(uuid[], uuid, date) from public;
    revoke all on function public.reprogramar_titulos(uuid[], date) from public;
    revoke all on function public.excluir_titulos(uuid[]) from public;
    revoke all on function public.restaurar_titulos(uuid[]) from public;
    revoke all on function public.marcar_perda(uuid[]) from public;
    revoke all on function public.estornar_baixas(uuid) from public;
    grant execute on function public.editar_titulo(uuid, text, date, date, uuid, text, text, bigint) to authenticated;
    grant execute on function public.duplicar_titulo(uuid, date) to authenticated;
    grant execute on function public.baixar_titulos(uuid[], uuid, date) to authenticated;
    grant execute on function public.reprogramar_titulos(uuid[], date) to authenticated;
    grant execute on function public.excluir_titulos(uuid[]) to authenticated;
    grant execute on function public.restaurar_titulos(uuid[]) to authenticated;
    grant execute on function public.marcar_perda(uuid[]) to authenticated;
    grant execute on function public.estornar_baixas(uuid) to authenticated;
  end if;
end $$;
