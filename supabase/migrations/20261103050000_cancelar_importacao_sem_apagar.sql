-- Cancelar importação, versão simples (pedido do Nicolas em 2026-11-03, depois da primeira versão):
-- "o cancelamento de importações não apaga o que já foi feito; para cancelar não precisa de
-- autenticação MFA, pode cancelar normal; caso necessário podemos simplesmente ler novamente o OFX".
--
-- Agora cancelar_importacao:
--   * vale para quem pode conciliar (conciliacao.editar), sem master e sem código do autenticador;
--   * tira do extrato só as linhas do arquivo que ainda estão "para conciliar";
--   * o que já foi feito fica: lançamento conciliado (à mão ou por regra) ou ignorado continua, com o
--     título, o pagamento e a transferência;
--   * as linhas tiradas não vão para movimentos_apagados: ler o OFX de novo traz de volta.
-- O motivo continua obrigatório e o Histórico registra quem cancelou.

create or replace function public.cancelar_importacao(p_importacao uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i importacoes_extrato%rowtype;
  v_motivo text := app.motivo_valido(p_motivo);
  v_mes text;
  v_apagados int;
  v_mantidos int;
begin
  select * into i from importacoes_extrato where id = p_importacao for update;
  if not found or not app.pode(i.empresa_id, 'conciliacao.editar') then
    raise exception 'Sem permissão para cancelar importações' using errcode = 'insufficient_privilege';
  end if;
  if i.cancelada_em is not null then
    raise exception 'Esta importação já foi cancelada' using errcode = 'check_violation';
  end if;
  if i.origem = 'open_finance' then
    raise exception 'Leitura do Open Finance não se cancela: o banco manda de novo na próxima leitura. Ignore os lançamentos um a um'
      using errcode = 'check_violation';
  end if;
  select to_char(min(mb.data), 'MM/YYYY') into v_mes from movimentos_bancarios mb
  where mb.importacao_id = i.id and mb.status = 'pendente'
    and exists (select 1 from periodos_fechados pf where pf.empresa_id = i.empresa_id and pf.mes = date_trunc('month', mb.data)::date);
  if v_mes is not null then
    raise exception 'Mês % está fechado: reabra o mês para cancelar esta importação', v_mes using errcode = 'check_violation';
  end if;

  delete from movimentos_bancarios where importacao_id = i.id and status = 'pendente';
  get diagnostics v_apagados = row_count;
  select count(*) into v_mantidos from movimentos_bancarios where importacao_id = i.id;

  update importacoes_extrato
  set cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = v_motivo
  where id = i.id;

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, antes)
  values (i.empresa_id, auth.uid(),
          coalesce((select lower(email) from auth.users where id = auth.uid()), auth.uid()::text),
          'importacao_extrato', i.id::text, 'delete',
          format('Cancelou a importação %s (%s a %s): %s lançamento(s) para conciliar saíram do extrato%s. Motivo: %s.',
                 coalesce(i.arquivo_path, i.origem), to_char(i.periodo_inicio, 'DD/MM/YYYY'), to_char(i.periodo_fim, 'DD/MM/YYYY'),
                 v_apagados,
                 case when v_mantidos > 0 then format('; %s já conciliado(s) ou ignorado(s) ficaram', v_mantidos) else '' end,
                 v_motivo),
          to_jsonb(i));

  return jsonb_build_object('apagados', v_apagados, 'mantidos', v_mantidos);
end $$;

revoke all on function public.cancelar_importacao(uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.cancelar_importacao(uuid, text) to authenticated;
  end if;
end $$;

select app.travar_referencias();
