-- Produtos de venda x insumos de consumo da piscicultura.
-- (Renumerada de 20261102060000 para 20261102170000 ao entrar no desenvolvimento depois de 20261102160000_remover_rh.)
-- Pedido do Nicolas (2026-11-02): ao cadastrar um insumo (ex.: milho), a Tabela de preços mostrava o item
-- como pendente de preço de venda. Agora cada produto diz se é vendido (para_venda); só os de venda
-- aparecem na tabela de preços, nas notas, nas vendas fixas e podem ganhar preço ou entrar num pedido.

alter table produtos add column para_venda boolean;

-- Classificação dos produtos que já existem (nada é apagado):
--  ovo e peixes (descarte) são de venda; ração, ingredientes, embalagens, vacinas e medicamentos são consumo;
--  "outro" e qualquer produto que já tenha preço geral ou já tenha sido vendido continuam de venda.
update produtos p set para_venda =
  p.tipo in ('ovo', 'peixe')
  or exists (select 1 from tabelas_preco t where t.produto_id = p.id and t.cliente_id is null and upper_inf(t.vigencia))
  or exists (select 1 from pedido_itens i where i.produto_id = p.id)
  or exists (select 1 from pedidos_fixos f, jsonb_array_elements(f.itens) x
             where f.empresa_id = p.empresa_id and x->>'produto_id' = p.id::text);

-- Produto novo sem a informação: ovo e peixes são de venda, o resto é consumo.
create or replace function app.produto_para_venda_padrao() returns trigger language plpgsql set search_path = public as $$
begin
  if new.para_venda is null then
    new.para_venda := new.tipo in ('ovo', 'peixe');
  end if;
  return new;
end $$;
create trigger produto_para_venda_padrao before insert or update of para_venda on produtos
  for each row execute function app.produto_para_venda_padrao();

alter table produtos alter column para_venda set not null;
create index on produtos (empresa_id) where para_venda;

-- Preço de venda e item de pedido só para produto de venda. Preço antigo de um produto que deixou de ser
-- vendido fica no histórico (a trava vale só para preço novo).
create or replace function app.exige_produto_de_venda() returns trigger language plpgsql set search_path = public as $$
declare
  v record;
begin
  select nome, para_venda into v from produtos where id = new.produto_id;
  if found and not v.para_venda then
    raise exception '% é insumo de consumo, não produto de venda. Marque "Vendo este produto" no cadastro para vender.', v.nome
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger preco_so_de_venda before insert on tabelas_preco
  for each row execute function app.exige_produto_de_venda();
create trigger item_so_de_venda before insert on pedido_itens
  for each row execute function app.exige_produto_de_venda();

select app.travar_referencias();
