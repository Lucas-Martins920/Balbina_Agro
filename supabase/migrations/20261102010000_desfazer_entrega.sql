-- Desfazer entrega e desfazer faturamento (pedido marcado por engano).

-- Desfazer entrega: o pedido marcado como entregue por engano volta para "faturado".
-- Marcar como entregue só muda o status (estoque e contas a receber saem no faturamento),
-- então desfazer também só muda o status. Quem desfez fica no histórico de alterações.
create or replace function public.desfazer_entrega(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
declare p pedidos_venda%rowtype;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if not app.pode(p.empresa_id, 'vendas.cancelar') then
    raise exception 'Seu usuário não tem permissão para desfazer a entrega' using errcode = 'insufficient_privilege';
  end if;
  if p.status <> 'entregue' then
    raise exception 'Só pedido entregue pode ter a entrega desfeita' using errcode = 'check_violation';
  end if;
  if p.origem = 'pdv' then
    raise exception 'Venda do balcão (PDV) é entregue na hora; para desfazer, cancele a venda' using errcode = 'check_violation';
  end if;
  update pedidos_venda set status = 'faturado', updated_at = now() where id = p_pedido;
end $$;

-- Desfazer faturamento: o pedido faturado por engano volta para "aberto". Os ovos voltam ao estoque e as
-- contas a receber geradas pelo faturamento são canceladas (ficam no histórico; faturar de novo gera outras).
-- Recusa quando já há recebimento, cobrança (boleto/Pix) ativa, nota fiscal válida ou entrada como compra
-- em outra empresa do grupo: cada um tem o próprio caminho de desfazer antes.
create or replace function public.desfazer_faturamento(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  v_grupo text;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if not app.pode(p.empresa_id, 'vendas.cancelar') then
    raise exception 'Seu usuário não tem permissão para desfazer o faturamento' using errcode = 'insufficient_privilege';
  end if;
  if p.origem = 'pdv' then
    raise exception 'Venda do balcão (PDV) é faturada na hora; para desfazer, cancele a venda' using errcode = 'check_violation';
  end if;
  if p.status = 'entregue' then
    raise exception 'Desfaça a entrega antes de desfazer o faturamento' using errcode = 'check_violation';
  end if;
  if p.status <> 'faturado' then
    raise exception 'Só pedido faturado pode ter o faturamento desfeito' using errcode = 'check_violation';
  end if;
  perform app.travar_estoque(p.empresa_id);
  if exists (select 1 from agendamentos where origem = 'pedido_venda' and origem_id = p_pedido and pago_cents > 0) then
    raise exception 'O pedido já tem recebimento; estorne o recebimento antes de desfazer o faturamento' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cobrancas c join agendamentos a on a.id = c.agendamento_id
             where a.origem = 'pedido_venda' and a.origem_id = p_pedido and c.status in ('processando', 'emitida', 'visualizada')) then
    raise exception 'O pedido tem boleto/Pix ativo; cancele a cobrança antes de desfazer o faturamento' using errcode = 'check_violation';
  end if;
  if exists (select 1 from notas_fiscais where pedido_venda_id = p_pedido and status in ('processando', 'autorizada', 'cancelando')) then
    raise exception 'O pedido tem nota fiscal válida; cancele a nota (ou faça a devolução, se passou o prazo) antes de desfazer o faturamento' using errcode = 'check_violation';
  end if;
  v_grupo := app.entrada_no_grupo(p_pedido);
  if v_grupo is not null then
    raise exception 'Este pedido já entrou como compra em %; desfaça a entrada lá antes', v_grupo using errcode = 'check_violation';
  end if;
  delete from movimentos_estoque where origem_tabela = 'pedidos_venda' and origem_id = p_pedido;
  update agendamentos set status = 'cancelado', updated_at = now() where origem = 'pedido_venda' and origem_id = p_pedido;
  update pedidos_venda set status = 'aberto', updated_at = now() where id = p_pedido;
end $$;

-- Cancelar não pode deixar uma nota fiscal válida para trás: cancele a nota antes.
create or replace function public.cancelar_pedido(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  v_grupo text;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.status = 'cancelado' then return; end if;
  if exists (select 1 from agendamentos where origem = 'pedido_venda' and origem_id = p_pedido and pago_cents > 0) then
    raise exception 'O pedido já tem recebimento; estorne o recebimento antes de cancelar' using errcode = 'check_violation';
  end if;
  if exists (select 1 from notas_fiscais where pedido_venda_id = p_pedido and status in ('processando', 'autorizada', 'cancelando')) then
    raise exception 'O pedido tem nota fiscal válida; cancele a nota antes de cancelar o pedido' using errcode = 'check_violation';
  end if;
  v_grupo := app.entrada_no_grupo(p_pedido);
  if v_grupo is not null then
    raise exception 'Este pedido já entrou como compra em %; desfaça a entrada lá antes de cancelar', v_grupo using errcode = 'check_violation';
  end if;
  delete from movimentos_estoque where origem_tabela = 'pedidos_venda' and origem_id = p_pedido;
  update agendamentos set status = 'cancelado', updated_at = now() where origem = 'pedido_venda' and origem_id = p_pedido;
  update pedidos_venda set status = 'cancelado', updated_at = now() where id = p_pedido;
end $$;

revoke all on function public.desfazer_entrega(uuid), public.desfazer_faturamento(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.desfazer_entrega(uuid), public.desfazer_faturamento(uuid) to authenticated;
  end if;
end $$;

select app.travar_referencias();
