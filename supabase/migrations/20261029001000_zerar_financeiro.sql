-- Zerar o financeiro da empresa (pedido do Nicolas em 2026-10-28): apaga todos os lançamentos e a
-- conciliação e deixa o saldo de todas as contas e caixas em zero, para recomeçar ou reimportar o NIBO limpo.
--
-- Apaga: títulos a pagar/receber (e rateios), baixas, transferências, recorrências, cobranças e remessas
-- CNAB dos títulos, extratos importados, movimentos do extrato, conciliações, meses fechados e os vínculos
-- de importação de títulos/baixas/transferências.
-- Mantém: contas e caixas (saldo inicial vira zero), categorias, centros de custo, contatos, produtos,
-- regras de conciliação, conexão do Open Finance (volta a buscar o extrato inteiro), orçamento,
-- produção, estoque, vendas e notas. A venda continua; só o título que ela gerou some.
-- Anexos ligados a lançamentos ficam, desligados do lançamento.
--
-- Só o master, com o código do autenticador digitado há no máximo 5 minutos e o nome da empresa.
-- Cada linha apagada fica no histórico (trigger historico) e um resumo entra como "Financeiro".

-- Código do autenticador (TOTP) confirmado nesta sessão há no máximo p_minutos (claim amr do Supabase Auth).
create or replace function app.mfa_recente(p_minutos int default 5) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' and exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) m
    where m ->> 'method' = 'totp'
      and (m ->> 'timestamp')::numeric >= extract(epoch from now() - make_interval(mins => p_minutos)))
$$;

-- Ao zerar, as baixas saem antes dos títulos: não vale recalcular (e registrar no histórico e nos
-- webhooks) o saldo de um título que vai ser apagado em seguida.
create or replace function app.atualiza_saldo_agendamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ag uuid := coalesce(new.agendamento_id, old.agendamento_id);
begin
  if tg_op = 'DELETE' and current_setting('app.zerando_financeiro', true) = old.empresa_id::text then
    return null;
  end if;
  update agendamentos a set
    pago_cents = s.pago,
    status = case
      when a.status in ('perda','cancelado') then a.status
      when s.pago = 0 then 'aberto'
      when s.pago < a.valor_cents - a.desconto_cents then 'parcial'
      else 'quitado' end,
    updated_at = now()
  from (select coalesce(sum(valor_cents),0) pago from baixas where agendamento_id = v_ag) s
  where a.id = v_ag;
  return null;
end $$;

create or replace function public.zerar_financeiro(p_empresa uuid, p_confirmacao text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp empresas%rowtype;
  v_digitado text := lower(regexp_replace(btrim(coalesce(p_confirmacao, '')), '\s+', ' ', 'g'));
  v jsonb := '{}';
  n bigint;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o master da empresa pode zerar o financeiro' using errcode = 'insufficient_privilege';
  end if;
  if not app.mfa_recente(5) then
    raise exception 'Confirme com o código do autenticador antes de zerar o financeiro' using errcode = 'insufficient_privilege';
  end if;
  -- trava a empresa: duas execuções ao mesmo tempo esperam uma pela outra
  select * into v_emp from empresas where id = p_empresa for update;
  if v_digitado = '' or v_digitado not in (
      lower(regexp_replace(btrim(v_emp.razao_social), '\s+', ' ', 'g')),
      lower(regexp_replace(btrim(coalesce(v_emp.nome_fantasia, '')), '\s+', ' ', 'g'))) then
    raise exception 'Digite o nome da empresa para confirmar' using errcode = 'check_violation';
  end if;

  perform set_config('app.zerando_financeiro', p_empresa::text, true);

  -- meses fechados travam a exclusão de baixas e transferências
  delete from periodos_fechados where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('meses_reabertos', n);

  delete from conciliacoes where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('conciliacoes', n);
  delete from movimentos_bancarios where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('movimentos_extrato', n);
  delete from importacoes_extrato where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('extratos_importados', n);

  delete from baixas where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('baixas', n);
  delete from transferencias where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('transferencias', n);
  delete from cobrancas where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('cobrancas', n);
  delete from remessas_cnab where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('remessas_cnab', n);
  delete from agendamentos where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('titulos', n);
  delete from recorrencias where empresa_id = p_empresa;
  get diagnostics n = row_count; v := v || jsonb_build_object('recorrencias', n);

  update documentos set vinculo_tabela = null, vinculo_id = null
  where empresa_id = p_empresa
    and vinculo_tabela in ('agendamentos', 'baixas', 'transferencias', 'movimentos_bancarios', 'cobrancas');
  -- reimportar do NIBO volta a criar os lançamentos em vez de achar que já existem
  delete from importacao_vinculos where empresa_id = p_empresa and entidade in ('titulo', 'baixa', 'transferencia');

  update contas_financeiras set saldo_inicial_cents = 0, updated_at = now()
  where empresa_id = p_empresa and saldo_inicial_cents <> 0;
  get diagnostics n = row_count; v := v || jsonb_build_object('contas_zeradas', n);
  -- a próxima sincronização do Open Finance traz o extrato inteiro, não só os últimos dias
  update conexoes_bancarias set ultima_sincronizacao = null, updated_at = now()
  where empresa_id = p_empresa and ultima_sincronizacao is not null;

  perform set_config('app.zerando_financeiro', '', true);

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, antes)
  values (
    p_empresa, auth.uid(),
    coalesce((select lower(email) from auth.users where id = auth.uid()), auth.uid()::text),
    'financeiro', p_empresa::text, 'delete',
    format('Zerou o financeiro: %s títulos, %s baixas, %s transferências, %s lançamentos do extrato e %s conciliações apagados; saldos das contas em zero',
      v->>'titulos', v->>'baixas', v->>'transferencias', v->>'movimentos_extrato', v->>'conciliacoes'),
    v);
  return v;
end $$;

revoke all on function public.zerar_financeiro(uuid, text) from public;
revoke all on function app.mfa_recente(int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.zerar_financeiro(uuid, text) to authenticated;
    grant execute on function app.mfa_recente(int) to authenticated;
  end if;
end $$;
