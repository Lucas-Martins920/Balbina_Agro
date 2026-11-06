-- Correções da auditoria de 2026-10-28 (skills improve e ponytail).

-- 1. Master também precisa do 2º fator (quando tem autenticador) e da assinatura em dia,
--    como já exige app.pode. As funções security definer de importação e de usuários
--    se apoiam só em e_master e furavam as duas regras.
create or replace function app.e_master(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.mfa_em_dia() and app.empresa_liberada(p_empresa) and exists (
    select 1 from usuarios_empresa
    where empresa_id = p_empresa and user_id = auth.uid() and ativo and is_admin)
$$;

-- 2. Baixa: juros, multa e desconto não negativos, e o desconto não passa do que foi pago.
--    Sem isso um "recebimento" com desconto maior que o valor saía do caixa.
--    not valid: vale para as novas baixas sem travar a migration por algum dado antigo.
alter table baixas add constraint baixas_acrescimos_validos check (
  juros_cents >= 0 and multa_cents >= 0 and desconto_cents >= 0
  and desconto_cents <= valor_cents + juros_cents + multa_cents) not valid;

-- 3. Índice único repetido: cobrancas_id_externo_un (migration 10) já cobre o mesmo par.
drop index if exists cobrancas_perfil_cobranca_id_id_externo_idx;

-- 4. Pagamento com o desconto do Asaas (até o vencimento) quita o título: a diferença
--    vira desconto da baixa em vez de deixar o título "parcial" para sempre.
create or replace function public.baixar_cobranca(p_perfil uuid, p_id_externo text, p_valor_cents bigint, p_data date) returns text
language plpgsql set search_path = public as $$
declare
  c cobrancas%rowtype;
  t titulos%rowtype;
  v_conta uuid;
  v_pct numeric;
  v_desconto bigint := 0;
  v_baixa bigint;
begin
  select * into c from cobrancas where perfil_cobranca_id = p_perfil and id_externo = p_id_externo for update;
  if not found then return 'desconhecida'; end if;
  if c.status = 'paga' then return 'ja_paga'; end if;
  select conta_repasse_id, desconto_ate_vencimento_percentual into v_conta, v_pct from perfis_cobranca where id = c.perfil_cobranca_id;
  select * into t from titulos where id = c.agendamento_id;

  if t.status in ('aberto', 'parcial') and t.saldo_cents > 0 then
    if v_pct > 0 and p_data <= c.vencimento and p_valor_cents < t.saldo_cents then
      v_desconto := least(t.saldo_cents - p_valor_cents, round(c.valor_cents * v_pct / 100)::bigint);
    end if;
    v_baixa := least(p_valor_cents + v_desconto, t.saldo_cents);
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, desconto_cents, observacao)
    values (c.empresa_id, c.agendamento_id, v_conta, p_data, v_baixa, greatest(p_valor_cents + v_desconto - v_baixa, 0), v_desconto,
            'Pago pela cobrança ' || p_id_externo);
  end if;
  update cobrancas set status = 'paga', paga_em = p_data::timestamptz, updated_at = now() where id = c.id;
  return case when v_baixa is null then 'titulo_ja_quitado' else 'baixada' end;
end $$;
