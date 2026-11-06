-- Automações do estoque (B2, B3 e B4 do estudo docs/estudo-automacao.html).
--
-- B2/B3: compra sugerida e ordem da fábrica sugerida são calculadas na tela (src/lib/abastecimento.ts);
--        aqui só os dias que cada empresa quer cobrir.
-- B4: ficha de embalagem do produto de venda (ex.: Caixa 12 cartelas = 12 cartelas + 1 caixa de papelão).
--     Ao faturar o pedido, as embalagens saem do estoque junto com os ovos; cancelar o pedido devolve
--     (o cancelamento já apaga os movimentos com origem no pedido).

alter table automacoes_empresa
  add column compra_dias smallint not null default 30 check (compra_dias between 1 and 180),
  add column producao_dias smallint not null default 7 check (producao_dias between 1 and 60);

create table produto_embalagens (
  empresa_id uuid not null references empresas(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  embalagem_id uuid not null references produtos(id) on delete restrict,
  quantidade numeric(10,3) not null check (quantidade > 0),
  primary key (produto_id, embalagem_id)
);
create index on produto_embalagens (empresa_id);
create index on produto_embalagens (embalagem_id);
alter table produto_embalagens enable row level security;
create policy membros on produto_embalagens using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on produto_embalagens as restrictive for insert with check (app.pode(empresa_id, 'produtos.editar'));
create policy escrita_alterar on produto_embalagens as restrictive for update
  using (app.pode(empresa_id, 'produtos.editar')) with check (app.pode(empresa_id, 'produtos.editar'));
create policy escrita_apagar on produto_embalagens as restrictive for delete using (app.pode(empresa_id, 'produtos.editar'));

create or replace function app.confere_ficha_embalagem() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from produtos where id = new.produto_id and empresa_id = new.empresa_id and tipo = 'ovo') then
    raise exception 'A ficha de embalagem é de um produto de venda de ovos' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from produtos where id = new.embalagem_id and empresa_id = new.empresa_id and tipo = 'embalagem') then
    raise exception 'Escolha um produto do tipo embalagem' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger confere_ficha_embalagem before insert or update on produto_embalagens
  for each row execute function app.confere_ficha_embalagem();

-- Saída das embalagens no faturamento. Sai do depósito com mais saldo; sem saldo suficiente sai só o
-- que há (a venda nunca trava por falta de caixa no sistema) e o resto fica para ajuste.
create or replace function app.baixar_embalagens() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_dep uuid;
  v_saldo numeric;
begin
  for r in
    select pe.embalagem_id, sum(i.quantidade * pe.quantidade) as qtd
    from pedido_itens i join produto_embalagens pe on pe.produto_id = i.produto_id
    where i.pedido_id = new.id
    group by pe.embalagem_id
  loop
    select s.deposito_id, s.saldo into v_dep, v_saldo from saldos_estoque s
    where s.produto_id = r.embalagem_id and s.saldo > 0 order by s.saldo desc limit 1;
    continue when v_dep is null;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, created_by)
    values (new.empresa_id, r.embalagem_id, v_dep, app.hoje(new.empresa_id), 'venda', -least(r.qtd, v_saldo),
            'pedidos_venda', new.id, auth.uid());
  end loop;
  return null;
end $$;
create trigger baixar_embalagens after update of status on pedidos_venda
  for each row when (new.status = 'faturado' and old.status is distinct from 'faturado')
  execute function app.baixar_embalagens();

select app.travar_referencias();
