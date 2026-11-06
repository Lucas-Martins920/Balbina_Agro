-- Histórico de compra por cliente (pedidos faturados ou entregues): base do relatório
-- "clientes sem comprar há mais de N dias" (padrão EngordaWeb). Agregado no banco para
-- não depender de trazer todos os pedidos para a tela.
create view clientes_compras with (security_invoker = true) as
select p.empresa_id, p.cliente_id, max(p.data) as ultima_compra, count(*)::int as pedidos, sum(p.total_cents)::bigint as total_cents
from pedidos_venda p
where p.status in ('faturado', 'entregue')
group by p.empresa_id, p.cliente_id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on clientes_compras to authenticated;
  end if;
end $$;
