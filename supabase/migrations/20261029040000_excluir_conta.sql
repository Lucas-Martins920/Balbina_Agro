-- Contas e caixas editáveis na tela Contas e saldos (pedido do Nicolas em 2026-10-28).
-- Excluir vale só para a conta sem nenhum movimento e sem banco ligado pelo Open Finance; a que já tem
-- histórico é arquivada (some das telas, o histórico e os vínculos ficam). Antes, excluir uma conta com
-- extrato importado levava o extrato junto em cascata, e a com baixa dava o erro cru da chave estrangeira.
-- A conta importada do NIBO excluída perde o vínculo junto, para a próxima importação criá-la de novo
-- em vez de apontar para uma conta que não existe mais.

create or replace function app.protege_exclusao_conta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.open_finance_conta_id is not null then
    raise exception 'A conta % está ligada ao banco pelo Open Finance. Arquive em vez de excluir.', old.nome
      using errcode = 'restrict_violation';
  end if;
  if exists (select 1 from baixas where conta_id = old.id)
     or exists (select 1 from transferencias where conta_origem_id = old.id or conta_destino_id = old.id)
     or exists (select 1 from movimentos_bancarios where conta_id = old.id)
     or exists (select 1 from importacoes_extrato where conta_id = old.id)
     or exists (select 1 from remessas_cnab where conta_id = old.id)
     or exists (select 1 from perfis_cobranca where conta_repasse_id = old.id) then
    raise exception 'A conta % já tem movimentos. Arquive em vez de excluir: ela some das telas e o histórico fica.', old.nome
      using errcode = 'restrict_violation';
  end if;
  delete from importacao_vinculos where empresa_id = old.empresa_id and entidade = 'conta' and registro_id = old.id;
  return old;
end $$;

create trigger protege_exclusao before delete on contas_financeiras
for each row execute function app.protege_exclusao_conta();

select app.travar_referencias();
