-- Marco 5c: cobrança de contas a receber pelo Asaas (boleto e Pix) com baixa automática pelo webhook.

alter table contatos add column asaas_cliente_id text;
create unique index cobrancas_id_externo_un on cobrancas (perfil_cobranca_id, id_externo) where id_externo is not null;
create unique index cobrancas_ativa_un on cobrancas (agendamento_id) where status in ('processando', 'emitida', 'visualizada');

-- Abre a cobrança de um título a receber. O app chama o provedor em seguida e grava o retorno.
-- Vencido vira vencimento hoje; o valor é o saldo em aberto.
create or replace function public.preparar_cobranca(p_agendamento uuid, p_perfil uuid, p_meio text default 'boleto_pix') returns uuid
language plpgsql set search_path = public as $$
declare
  t titulos%rowtype;
  p perfis_cobranca%rowtype;
  v_doc text;
  v_id uuid;
begin
  select * into t from titulos where id = p_agendamento;
  if not found then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if t.tipo <> 'receber' then raise exception 'Só contas a receber podem ser cobradas' using errcode = 'check_violation'; end if;
  if t.status not in ('aberto', 'parcial') or t.saldo_cents <= 0 then
    raise exception 'Título sem saldo em aberto' using errcode = 'check_violation';
  end if;
  select * into p from perfis_cobranca where id = p_perfil and empresa_id = t.empresa_id and ativo;
  if not found then raise exception 'Perfil de cobrança inválido' using errcode = 'check_violation'; end if;
  if p.conta_repasse_id is null then
    raise exception 'Defina no perfil a conta onde o dinheiro da cobrança cai' using errcode = 'check_violation';
  end if;
  select cpf_cnpj into v_doc from contatos where id = t.contato_id;
  if v_doc is null then
    raise exception 'O cliente precisa ter CPF ou CNPJ cadastrado para receber boleto ou Pix' using errcode = 'check_violation';
  end if;

  insert into cobrancas (empresa_id, agendamento_id, perfil_cobranca_id, meio, vencimento, valor_cents)
  values (t.empresa_id, t.id, p.id, p_meio, greatest(t.vencimento, current_date), t.saldo_cents)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Este título já tem uma cobrança em aberto' using errcode = 'check_violation';
end $$;

-- Pagamento confirmado pelo provedor: baixa o título na conta de repasse do perfil.
-- Pode chegar mais de uma vez; a segunda não faz nada. Só o webhook (service role) chama.
create or replace function public.baixar_cobranca(p_perfil uuid, p_id_externo text, p_valor_cents bigint, p_data date) returns text
language plpgsql set search_path = public as $$
declare
  c cobrancas%rowtype;
  t titulos%rowtype;
  v_conta uuid;
  v_baixa bigint;
begin
  select * into c from cobrancas where perfil_cobranca_id = p_perfil and id_externo = p_id_externo for update;
  if not found then return 'desconhecida'; end if;
  if c.status = 'paga' then return 'ja_paga'; end if;
  select conta_repasse_id into v_conta from perfis_cobranca where id = c.perfil_cobranca_id;
  select * into t from titulos where id = c.agendamento_id;

  if t.status in ('aberto', 'parcial') and t.saldo_cents > 0 then
    v_baixa := least(p_valor_cents, t.saldo_cents);
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao)
    values (c.empresa_id, c.agendamento_id, v_conta, p_data, v_baixa, greatest(p_valor_cents - v_baixa, 0),
            'Pago pela cobrança ' || p_id_externo);
  end if;
  update cobrancas set status = 'paga', paga_em = p_data::timestamptz, updated_at = now() where id = c.id;
  return case when v_baixa is null then 'titulo_ja_quitado' else 'baixada' end;
end $$;

-- o Supabase dá execute em toda função nova para anon e authenticated; esta não pode
revoke execute on function public.baixar_cobranca(uuid, text, bigint, date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.baixar_cobranca(uuid, text, bigint, date) from authenticated, anon;
    grant execute on function public.preparar_cobranca(uuid, uuid, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.baixar_cobranca(uuid, text, bigint, date) to service_role;
  end if;
end $$;
