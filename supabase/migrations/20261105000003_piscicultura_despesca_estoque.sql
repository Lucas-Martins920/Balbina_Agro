-- Balbina: despesca e estoque de peixe em kg.
--
-- Na avicultura os ovos entravam no estoque todo dia pelo apontamento e depois eram classificados. No peixe a
-- produção sai de uma vez, na despesca: o lote (ou parte dele) sai do viveiro e os kg entram no estoque do
-- pescado, por classe de tamanho. Daí em diante vale o que já existia: pontos de venda, transferências, pedidos,
-- faturamento, PDV, inventário. A unidade do estoque de peixe é o kg (com casas decimais).
--
-- A carência dos medicamentos (eventos_sanitarios.carencia_dias) passa a travar a despesca do lote, em vez de
-- separar ovos no estoque.

-- ---------------------------------------------------------------------------
-- 1. Tipos de produto, depósito e movimento
--    produto: ovo → peixe (pescado vendido, em kg); a antiga ave viva (já renomeada peixe) → alevino
-- ---------------------------------------------------------------------------
alter table produtos drop constraint produtos_tipo_check;
update produtos set tipo = 'alevino' where tipo = 'peixe';
update produtos set tipo = 'peixe' where tipo = 'ovo';
alter table produtos add constraint produtos_tipo_check
  check (tipo in ('peixe', 'alevino', 'racao', 'insumo_racao', 'embalagem', 'medicamento', 'vacina', 'outro'));
comment on column produtos.fator_kg is 'Pescado: kg de peixe em uma unidade de venda (kg = 1, caixa de 20 kg = 20)';

alter table depositos drop constraint depositos_tipo_check;
update depositos set tipo = 'peixe' where tipo = 'ovos';
update depositos d set nome = replace(d.nome, 'Ovos', 'Pescado')
where d.tipo = 'peixe' and d.nome like 'Ovos%'
  and not exists (select 1 from depositos x where x.empresa_id = d.empresa_id and x.nome = replace(d.nome, 'Ovos', 'Pescado'));
alter table depositos add constraint depositos_tipo_check
  check (tipo in ('peixe', 'insumos', 'racao', 'almoxarifado', 'expedicao'));

alter table movimentos_estoque drop constraint movimentos_estoque_tipo_check;
update movimentos_estoque set tipo = 'despesca' where tipo = 'producao_ovos';
update movimentos_estoque set tipo = 'ajuste' where tipo = 'classificacao';
alter table movimentos_estoque add constraint movimentos_estoque_tipo_check
  check (tipo in ('entrada_compra', 'despesca', 'producao_racao', 'consumo_lote', 'consumo_producao', 'venda', 'ajuste',
                  'transferencia', 'perda'));

-- ---------------------------------------------------------------------------
-- 2. Classes do pescado: por tamanho, sem cor. A classe "Inteiro" (sem_classificacao) recebe a despesca que não
--    foi separada por tamanho e é vendida também.
-- ---------------------------------------------------------------------------
drop trigger if exists unidade_ovo_mudou on empresas;
drop function if exists app.unidade_ovo_mudou();
drop function if exists app.garantir_classes_cor(uuid, text);
drop function if exists app.classe_sem_classificacao(uuid, text) cascade;

update classes_peixe c set nome = c.nome || ' (' || c.cor || ')'
where c.cor <> 'branco'
  and exists (select 1 from classes_peixe x where x.empresa_id = c.empresa_id and x.nome = c.nome and x.cor = 'branco');
update classes_peixe c set nome = 'Inteiro', comercializavel = true, ordem = 0
where c.sem_classificacao and c.cor = 'branco'
  and not exists (select 1 from classes_peixe x where x.empresa_id = c.empresa_id and x.nome = 'Inteiro');
alter table classes_peixe drop constraint classes_peixe_empresa_cor_nome_key;
alter table classes_peixe drop column cor;
alter table classes_peixe add constraint classes_peixe_empresa_id_nome_key unique (empresa_id, nome);
-- O peso da classe era o do ovo (até 999 g); agora é o peso por peixe, que passa de 3 kg.
alter table classes_peixe alter column peso_min_g type numeric(8,1), alter column peso_max_g type numeric(8,1);
comment on table classes_peixe is 'Classes do pescado por tamanho (peso por peixe). Cada classe tem um produto base, em kg, que guarda o estoque';
comment on column classes_peixe.sem_classificacao is 'Classe padrão da despesca sem separação por tamanho (peixe inteiro)';

drop function if exists app.rotulo_classe(text, text);

create or replace function app.classe_sem_classificacao(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from classes_peixe where empresa_id = p_empresa and sem_classificacao;
  if found then return v_id; end if;
  insert into classes_peixe (empresa_id, nome, comercializavel, ordem, sem_classificacao)
  values (p_empresa, 'Inteiro', true, 0, true)
  on conflict (empresa_id, nome) do update set sem_classificacao = true
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.protege_sem_classificacao() returns trigger
language plpgsql set search_path = public as $$
begin
  -- empresa sendo excluída leva as classes junto
  if tg_op = 'DELETE' and old.sem_classificacao and exists (select 1 from empresas where id = old.empresa_id) then
    raise exception 'A classe % recebe a despesca sem separação por tamanho e não pode ser excluída', old.nome
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.sem_classificacao is distinct from new.sem_classificacao then
    raise exception 'Não dá para mudar qual classe recebe a despesca sem separação por tamanho' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

-- nome do pescado de uma classe: "Inteiro" → "Peixe inteiro"
create or replace function app.nome_pescado(p_classe text) returns text
language sql immutable as $$
  select case when lower(p_classe) like 'peixe%' then p_classe else 'Peixe ' || lower(p_classe) end
$$;

create or replace function app.produto_base_peixe(p_classe uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  c classes_peixe%rowtype;
begin
  select id into v_id from produtos where classe_peixe_id = p_classe and base_estoque;
  if found then return v_id; end if;
  select * into c from classes_peixe where id = p_classe;
  insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm, base_estoque, para_venda)
  values (c.empresa_id, 'peixe', app.nome_pescado(c.nome) || ' (estoque)', 'kg', 1, c.id, '0302.89.90', true, false)
  on conflict (empresa_id, nome) do update set base_estoque = true, classe_peixe_id = excluded.classe_peixe_id, fator_kg = 1
  returning id into v_id;
  return v_id;
end $$;

-- Produtos de venda de uma classe comercializável: o kg e a caixa de 20 kg
create or replace function app.produtos_venda_peixe(p_classe uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c classes_peixe%rowtype;
  v_nome text;
begin
  select * into c from classes_peixe where id = p_classe;
  if not found or not c.comercializavel then return; end if;
  v_nome := app.nome_pescado(c.nome);
  insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm)
  values (c.empresa_id, 'peixe', v_nome || ' (kg)', 'kg', 1, c.id, '0302.89.90')
  on conflict (empresa_id, nome) do update set ativo = true
    where produtos.classe_peixe_id = excluded.classe_peixe_id and produtos.fator_kg = excluded.fator_kg;
  insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm)
  values (c.empresa_id, 'peixe', 'Caixa 20 kg · ' || lower(v_nome), 'cx', 20, c.id, '0302.89.90')
  on conflict do nothing;
end $$;

create or replace function app.produto_para_venda_padrao() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.para_venda is null then
    new.para_venda := new.tipo in ('peixe', 'alevino');
  end if;
  return new;
end $$;

create or replace function app.protege_produto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.base_estoque then
      raise exception 'O produto % guarda o estoque de peixe da classe e não pode ser excluído', old.nome using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if (new.tipo, new.unidade, new.fator_kg, new.classe_peixe_id, new.base_estoque)
     is distinct from (old.tipo, old.unidade, old.fator_kg, old.classe_peixe_id, old.base_estoque)
     and not (new.base_estoque and not old.base_estoque)   -- produto_base_peixe adotando um produto de mesmo nome
     and (old.base_estoque
          or exists (select 1 from movimentos_estoque where produto_id = old.id)
          or exists (select 1 from pedido_itens where produto_id = old.id)
          or exists (select 1 from formula_itens where insumo_id = old.id)) then
    raise exception 'O produto % já tem movimento: tipo, unidade e conversão não podem mudar. Cadastre um produto novo.', old.nome
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function app.confere_ficha_embalagem() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from produtos where id = new.produto_id and empresa_id = new.empresa_id and tipo = 'peixe') then
    raise exception 'A ficha de embalagem é de um produto de venda de peixe' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from produtos where id = new.embalagem_id and empresa_id = new.empresa_id and tipo = 'embalagem') then
    raise exception 'Escolha um produto do tipo embalagem' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- produtos de venda das classes que já existem (o kg e a caixa)
do $$
declare v uuid;
begin
  update produtos set ativo = false
  where tipo = 'peixe' and not base_estoque and unidade in ('ct', 'dz', 'un') and ativo;
  for v in select id from classes_peixe loop
    perform app.produtos_venda_peixe(v);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Depósito do pescado e ponto sede
-- ---------------------------------------------------------------------------
create or replace function app.deposito_padrao(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from depositos where empresa_id = p_empresa and tipo <> 'peixe' order by nome limit 1;
  if not found then
    insert into depositos (empresa_id, nome, tipo) values (p_empresa, 'Almoxarifado', 'almoxarifado')
    on conflict (empresa_id, nome) do update set nome = excluded.nome
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function app.ponto_sede(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_dep uuid;
  v_nome text := 'Piscicultura';
begin
  select id into v_id from pontos_venda where empresa_id = p_empresa and sede;
  if found then return v_id; end if;
  perform pg_advisory_xact_lock(hashtext('ponto_sede:' || p_empresa::text));
  select id into v_id from pontos_venda where empresa_id = p_empresa and sede;
  if found then return v_id; end if;

  select d.id into v_dep from depositos d
  where d.empresa_id = p_empresa and d.tipo = 'peixe'
    and not exists (select 1 from pontos_venda pv where pv.deposito_id = d.id)
  order by d.nome limit 1;
  if v_dep is null then
    insert into depositos (empresa_id, nome, tipo) values (p_empresa, 'Pescado', 'peixe')
    on conflict (empresa_id, nome) do update set tipo = 'peixe'
    returning id into v_dep;
    -- o gatilho do depósito novo já pode ter criado a sede
    select id into v_id from pontos_venda where empresa_id = p_empresa and sede;
    if found then return v_id; end if;
  end if;
  if exists (select 1 from pontos_venda where empresa_id = p_empresa and nome = v_nome) then
    v_nome := 'Piscicultura (sede)';
  end if;
  insert into pontos_venda (empresa_id, nome, tipo, sede, deposito_id)
  values (p_empresa, v_nome, 'piscicultura', true, v_dep)
  returning id into v_id;
  return v_id;
end $$;

drop trigger if exists sede_ponto_venda on depositos;
drop function if exists app.sede_no_deposito_de_ovos();
create or replace function app.sede_no_deposito_de_peixe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'peixe' and not exists (select 1 from pontos_venda where empresa_id = new.empresa_id and sede) then
    perform app.ponto_sede(new.empresa_id);
  end if;
  return null;
end $$;
create trigger sede_ponto_venda after insert on depositos
  for each row execute function app.sede_no_deposito_de_peixe();

create or replace function app.deposito_peixe(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select deposito_id into v_id from pontos_venda where empresa_id = p_empresa and sede;
  if found then return v_id; end if;
  v_id := app.ponto_sede(p_empresa);   -- em outra instrução: a linha criada agora precisa estar visível
  select deposito_id into v_id from pontos_venda where id = v_id;
  return v_id;
end $$;
drop function if exists app.deposito_ovos(uuid);

create or replace function app.conferir_ponto_venda() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.deposito_id <> old.deposito_id or new.sede <> old.sede then
    raise exception 'O depósito e a sede de um ponto de venda não mudam' using errcode = 'check_violation';
  end if;
  if new.sede and not new.ativo then
    raise exception 'A piscicultura (sede) não pode ser desativada' using errcode = 'check_violation';
  end if;
  if old.ativo and not new.ativo then
    if exists (select 1 from movimentos_estoque where deposito_id = new.deposito_id
               group by produto_id having sum(quantidade) <> 0) then
      raise exception 'O ponto % ainda tem peixe em estoque: transfira ou ajuste antes de desativar', new.nome
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from transferencias_peixe where status = 'em_transito' and (origem_id = new.id or destino_id = new.id)) then
      raise exception 'O ponto % tem transferência a caminho: receba ou cancele antes de desativar', new.nome
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function app.conferir_saldo_peixe(p_produtos uuid[]) returns void
language plpgsql stable set search_path = public as $$
declare v_classe text; v_saldo numeric; v_local text;
begin
  select c.nome, s.saldo, coalesce(pv.nome, 'piscicultura') into v_classe, v_saldo, v_local
  from (select m.produto_id, app.deposito_de_ponto(m.deposito_id) as ponto, sum(m.quantidade) as saldo
        from movimentos_estoque m where m.produto_id = any(p_produtos)
        group by m.produto_id, app.deposito_de_ponto(m.deposito_id)) s
  join produtos p on p.id = s.produto_id
  left join classes_peixe c on c.id = p.classe_peixe_id
  left join pontos_venda pv on pv.id = s.ponto
  where s.saldo < -0.0005
  limit 1;
  if found then
    raise exception 'Esse peixe já saiu do estoque: a classe % ficaria com % kg em %. Estorne a venda ou faça um ajuste de estoque antes',
      coalesce(v_classe, '?'), round(v_saldo, 2), v_local using errcode = 'check_violation';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Visões do estoque de peixe (kg)
-- ---------------------------------------------------------------------------
create view estoque_peixe with (security_invoker = true) as
select c.empresa_id, c.id as classe_id, c.nome as classe, c.ordem, c.comercializavel, p.id as produto_id,
       round(coalesce(s.saldo, 0), 3) as saldo,
       round(greatest(coalesce(s.saldo, 0), 0), 3) as disponivel,
       c.sem_classificacao, c.nome as classe_nome, c.peso_min_g, c.peso_max_g
from classes_peixe c
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (
  select m.produto_id, sum(m.quantidade) as saldo
  from movimentos_estoque m
  where not exists (select 1 from pontos_venda pv where pv.deposito_id = m.deposito_id and not pv.sede)
  group by m.produto_id
) s on s.produto_id = p.id;
comment on view estoque_peixe is 'Pescado na piscicultura (sede), em kg por classe';

create view estoque_peixe_ponto with (security_invoker = true) as
select pv.empresa_id, pv.id as ponto_venda_id, pv.nome as ponto_nome, pv.sede, pv.ativo as ponto_ativo,
       e.classe_id, e.classe, e.classe_nome, e.ordem, e.comercializavel, e.sem_classificacao, e.produto_id,
       e.saldo, e.disponivel
from pontos_venda pv
join estoque_peixe e on e.empresa_id = pv.empresa_id
where pv.sede
union all
select pv.empresa_id, pv.id, pv.nome, pv.sede, pv.ativo,
       c.id, c.nome, c.nome, c.ordem, c.comercializavel, c.sem_classificacao, p.id,
       round(coalesce(s.saldo, 0), 3), round(greatest(coalesce(s.saldo, 0), 0), 3)
from pontos_venda pv
join classes_peixe c on c.empresa_id = pv.empresa_id
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (
  select deposito_id, produto_id, sum(quantidade) as saldo from movimentos_estoque group by deposito_id, produto_id
) s on s.deposito_id = pv.deposito_id and s.produto_id = p.id
where not pv.sede;

create view estoque_produtos with (security_invoker = true) as
select p.empresa_id, p.id as produto_id, p.nome, p.tipo, p.unidade, d.id as deposito_id, d.nome as deposito,
       sum(m.quantidade) as saldo, p.custo_medio_cents, round(sum(m.quantidade) * p.custo_medio_cents)::bigint as valor_cents
from movimentos_estoque m
join produtos p on p.id = m.produto_id
join depositos d on d.id = m.deposito_id
where p.tipo <> 'peixe'
group by p.id, d.id;

create view saldos_produtos with (security_invoker = true) as
select p.empresa_id, p.id as produto_id,
       case when p.tipo = 'peixe' and not p.base_estoque then coalesce(e.saldo, 0) / coalesce(nullif(p.fator_kg, 0), 1)
            when p.tipo = 'peixe' then coalesce(e.saldo, 0)
            else coalesce(s.saldo, 0) end as saldo,
       case when p.tipo = 'peixe' then null::bigint
            else round(coalesce(s.saldo, 0) * p.custo_medio_cents)::bigint end as valor_cents
from produtos p
left join (select produto_id, sum(quantidade) as saldo from movimentos_estoque group by produto_id) s on s.produto_id = p.id
left join estoque_peixe e on e.classe_id = p.classe_peixe_id and p.tipo = 'peixe';

-- pedidos e itens vendidos com os kg de peixe
create view pedidos with (security_invoker = true) as
select p.id, p.empresa_id, p.numero, p.data, p.entrega_prevista, p.status, p.total_cents, p.forma_pagamento,
       p.condicao_pagamento, p.observacoes, p.origem, p.cliente_id, c.nome as cliente_nome,
       (select string_agg(format('%s %s', trim(to_char(i.quantidade, 'FM999G999D###')), pr.nome), ', ' order by pr.nome)
        from pedido_itens i join produtos pr on pr.id = i.produto_id where i.pedido_id = p.id) as itens,
       (select round(sum(i.quantidade * coalesce(pr.fator_kg, 0)), 3)
        from pedido_itens i join produtos pr on pr.id = i.produto_id
        where i.pedido_id = p.id and pr.tipo = 'peixe') as kg,
       pv.id as ponto_venda_id, pv.nome as ponto_nome, coalesce(pv.sede, true) as ponto_sede
from pedidos_venda p
join contatos c on c.id = p.cliente_id
left join pontos_venda pv on pv.id = p.ponto_venda_id
  or (p.ponto_venda_id is null and pv.empresa_id = p.empresa_id and pv.sede);

create view vendas_itens with (security_invoker = true) as
select p.empresa_id, p.id as pedido_id, p.numero, p.data, date_trunc('month', p.data)::date as mes,
       p.cliente_id, c.nome as cliente, i.produto_id, pr.nome as produto, pr.classe_peixe_id, co.nome as classe,
       i.quantidade,
       case when pr.tipo = 'peixe' then round(i.quantidade * coalesce(pr.fator_kg, 0), 3) else 0 end as kg,
       i.total_cents
from pedidos_venda p
join contatos c on c.id = p.cliente_id
join pedido_itens i on i.pedido_id = p.id
join produtos pr on pr.id = i.produto_id
left join classes_peixe co on co.id = pr.classe_peixe_id
where p.status in ('faturado', 'entregue');

-- ---------------------------------------------------------------------------
-- 5. Despesca: o lote (ou parte dele) sai do viveiro e os kg entram no estoque
-- ---------------------------------------------------------------------------
drop trigger if exists desfaz_classificacao on despescas;
drop function if exists app.desfaz_classificacao();
drop function if exists public.registrar_despesca(uuid, date, jsonb, uuid, text, uuid, text, integer, integer);
delete from movimentos_estoque where origem_tabela = 'despescas';
delete from despescas;   -- eram classificações de ovos: não têm equivalente no peixe

alter table despescas drop constraint classificacao_com_quantidade;
alter table despescas drop column cor;
alter table despescas drop column total;
alter table despescas drop column quebrados;
alter table despescas drop column diferenca;
alter table despescas alter column lote_id set not null;
alter table despescas drop constraint despescas_lote_id_fkey;
alter table despescas add constraint despescas_lote_id_fkey foreign key (lote_id) references lotes(id) on delete cascade;
alter table despescas
  add column viveiro_id uuid not null references viveiros(id) on delete restrict,
  add column tipo text not null check (tipo in ('parcial', 'total')),
  add column qtd_peixes integer not null check (qtd_peixes > 0),
  add column kg_total numeric(12,2) not null check (kg_total > 0),
  add column peso_medio_g numeric(10,1) generated always as (round(kg_total * 1000 / qtd_peixes, 1)) stored,
  add column peixes_perdidos integer not null default 0 check (peixes_perdidos >= 0),
  add column alocacao_id uuid not null references lote_alocacoes(id) on delete cascade,
  add column alocacao_nova_id uuid references lote_alocacoes(id) on delete set null;
drop index if exists despescas_lote_id_fk; -- coberto pelo índice (lote_id, data)
create index on despescas (lote_id, data);
create index on despescas (viveiro_id);
create index on despescas (alocacao_id);
create index on despescas (alocacao_nova_id);
comment on table despescas is 'Despesca: retirada dos peixes do viveiro. Parcial deixa peixes no viveiro; total esvazia o viveiro e, se for o último, encerra o lote';
comment on column despescas.peixes_perdidos is 'Na despesca total: peixes que deveriam estar no viveiro e não apareceram (predação, fuga, morte não apontada)';
comment on column despescas.alocacao_nova_id is 'Na despesca parcial: a alocação que segue no viveiro com os peixes que ficaram';

drop policy escrita_inserir on despescas;
drop policy escrita_alterar on despescas;
drop policy escrita_apagar on despescas;
-- despesca só pelas funções (elas mexem nas alocações e no estoque juntos)
create policy escrita_inserir on despescas as restrictive for insert with check (false);
create policy escrita_alterar on despescas as restrictive for update using (false);
create policy escrita_apagar on despescas as restrictive for delete using (false);

-- Ao apagar uma despesca, os kg saem do estoque (recusa se o peixe já foi vendido).
create or replace function app.desfaz_despesca_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_produtos uuid[];
begin
  perform app.travar_estoque(old.empresa_id);
  with d as (delete from movimentos_estoque where origem_tabela = 'despescas' and origem_id = old.id returning produto_id)
  select array_agg(distinct produto_id) into v_produtos from d;
  if v_produtos is not null then perform app.conferir_saldo_peixe(v_produtos); end if;
  return null;
end $$;
create trigger desfaz_despesca_estoque after delete on despescas
  for each row execute function app.desfaz_despesca_estoque();

create function public.registrar_despesca(p_empresa uuid, p_viveiro uuid, p_data date, p_tipo text, p_kg numeric,
                                          p_qtd_peixes integer default null, p_classes jsonb default null,
                                          p_observacoes text default null, p_client_id uuid default null,
                                          p_lote uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_aloc lote_alocacoes%rowtype;
  v_lote lotes%rowtype;
  v_vivos int;
  v_qtd int;
  v_peso numeric;
  v_carencia date;
  v_soma numeric;
  v_nova uuid;
begin
  if p_client_id is not null then
    select id into v_id from despescas where client_id = p_client_id and empresa_id = p_empresa;
    if found then return v_id; end if;   -- reenvio do app offline
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'lotes.editar', 'estoque.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar despesca' using errcode = 'insufficient_privilege';
  end if;
  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Informe a data da despesca; data futura não é aceita' using errcode = 'check_violation';
  end if;
  if p_tipo is null or p_tipo not in ('parcial', 'total') then
    raise exception 'Escolha despesca parcial ou total' using errcode = 'check_violation';
  end if;
  if p_kg is null or p_kg <= 0 then
    raise exception 'Informe os kg despescados' using errcode = 'check_violation';
  end if;
  if p_qtd_peixes is not null and p_qtd_peixes <= 0 then
    raise exception 'A quantidade de peixes precisa ser maior que zero' using errcode = 'check_violation';
  end if;

  select * into v_aloc from lote_alocacoes
  where (p_lote is null or lote_id = p_lote) and viveiro_id = p_viveiro and empresa_id = p_empresa
    and periodo @> p_data and upper_inf(periodo)
  for update;
  if not found then
    raise exception 'Não há lote neste viveiro em % (ou os peixes já saíram de lá)', to_char(p_data, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  select * into v_lote from lotes where id = v_aloc.lote_id for update;

  v_carencia := app.carencia_ate(v_lote.id, p_data);
  if v_carencia is not null then
    raise exception 'O lote % está em carência de medicamento até %: a despesca para venda só depois disso',
      v_lote.codigo, to_char(v_carencia, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios where lote_id = v_lote.id and viveiro_id = p_viveiro and data > p_data)
     or exists (select 1 from biometrias where lote_id = v_lote.id and viveiro_id = p_viveiro and data > p_data) then
    raise exception 'Há apontamentos ou biometrias deste viveiro depois de %; lance a despesca na ordem dos dias',
      to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  -- peixes vivos no fim do dia da despesca
  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_vivos
  from apontamentos_diarios
  where lote_id = v_lote.id and viveiro_id = p_viveiro and data >= lower(v_aloc.periodo) and data <= p_data;
  if v_vivos <= 0 then
    raise exception 'Não há peixes vivos neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  v_qtd := p_qtd_peixes;
  if p_tipo = 'total' then
    v_qtd := coalesce(v_qtd, v_vivos);
    if v_qtd > v_vivos then
      raise exception 'O viveiro tem % peixes vivos pelo apontamento; confira a contagem ou as mortes apontadas', v_vivos
        using errcode = 'check_violation';
    end if;
  else
    if v_qtd is null then
      v_peso := app.peso_estimado(v_lote.id, p_data);
      if v_peso is null or v_peso <= 0 then
        raise exception 'Informe quantos peixes saíram (o lote ainda não tem peso para estimar)' using errcode = 'check_violation';
      end if;
      v_qtd := greatest(round(p_kg * 1000 / v_peso)::int, 1);
    end if;
    if v_qtd >= v_vivos then
      raise exception 'A despesca parcial precisa deixar peixes no viveiro (há % vivos). Para tirar todos, use a despesca total', v_vivos
        using errcode = 'check_violation';
    end if;
  end if;

  -- classes: objeto {classe_id: kg}; sem classes, tudo vai para a classe Inteiro
  if p_classes is not null and jsonb_typeof(p_classes) = 'object' and p_classes <> '{}' then
    if exists (select 1 from jsonb_each_text(p_classes) o
               where nullif(replace(o.value, ',', '.'), '') !~ '^\d+(\.\d+)?$'
                  or not exists (select 1 from classes_peixe c where c.id::text = o.key and c.empresa_id = p_empresa)) then
      raise exception 'Classe do pescado inválida ou kg inválido' using errcode = 'check_violation';
    end if;
    select coalesce(sum(replace(value, ',', '.')::numeric), 0) into v_soma from jsonb_each_text(p_classes);
    if abs(v_soma - p_kg) > 0.05 then
      raise exception 'A soma das classes (% kg) precisa dar o total despescado (% kg)', round(v_soma, 2), round(p_kg, 2)
        using errcode = 'check_violation';
    end if;
  elsif p_classes is not null and jsonb_typeof(p_classes) not in ('object', 'null') then
    raise exception 'Classes em formato inválido' using errcode = 'check_violation';
  else
    p_classes := jsonb_build_object(app.classe_sem_classificacao(p_empresa)::text, p_kg);
  end if;

  insert into despescas (empresa_id, data, lote_id, viveiro_id, tipo, qtd_peixes, kg_total, peixes_perdidos, alocacao_id,
                         observacoes, client_id, created_by)
  values (p_empresa, p_data, v_lote.id, p_viveiro, p_tipo, v_qtd, round(p_kg, 2),
          case when p_tipo = 'total' then v_vivos - v_qtd else 0 end, v_aloc.id,
          nullif(trim(p_observacoes), ''), p_client_id, auth.uid())
  returning id into v_id;

  -- os peixes saem do viveiro no fim do dia da despesca
  update lote_alocacoes set periodo = daterange(lower(periodo), p_data + 1) where id = v_aloc.id;
  if p_tipo = 'parcial' then
    insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo)
    values (p_empresa, v_lote.id, p_viveiro, v_vivos - v_qtd, daterange(p_data + 1, null), 'despesca')
    returning id into v_nova;
    update despescas set alocacao_nova_id = v_nova where id = v_id;
  elsif not exists (select 1 from lote_alocacoes where lote_id = v_lote.id and upper_inf(periodo)) then
    update lotes set fase = 'encerrado', encerrado_em = p_data, motivo_encerramento = 'Despesca total', updated_at = now()
    where id = v_lote.id;
  end if;

  perform app.travar_estoque(p_empresa);
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, viveiro_id,
                                  origem_tabela, origem_id, created_by)
  select p_empresa, app.produto_base_peixe(key::uuid), app.deposito_peixe(p_empresa), p_data, 'despesca',
         round(replace(value, ',', '.')::numeric, 3), v_lote.id, p_viveiro, 'despescas', v_id, auth.uid()
  from jsonb_each_text(p_classes)
  where replace(value, ',', '.')::numeric > 0;
  return v_id;
end $$;

-- Desfaz a última despesca do lote: devolve os peixes ao viveiro e tira os kg do estoque.
create or replace function public.desfazer_despesca(p_despesca uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d despescas%rowtype;
  v_lote lotes%rowtype;
  v_viveiro text;
begin
  select * into d from despescas where id = p_despesca for update;
  if not found then raise exception 'Despesca não encontrada' using errcode = 'no_data_found'; end if;
  if not app.pode_algum(d.empresa_id, array['lotes.editar', 'estoque.editar']) then
    raise exception 'Seu usuário não tem permissão para desfazer despescas' using errcode = 'insufficient_privilege';
  end if;
  select * into v_lote from lotes where id = d.lote_id for update;

  if exists (select 1 from despescas x where x.lote_id = d.lote_id and x.id <> d.id
             and (x.data > d.data or (x.data = d.data and x.created_at > d.created_at))) then
    raise exception 'Só dá para desfazer a última despesca do lote' using errcode = 'check_violation';
  end if;
  if exists (select 1 from lote_transferencias t where t.lote_id = d.lote_id and t.data > d.data) then
    raise exception 'O lote foi transferido depois desta despesca; desfaça a transferência antes' using errcode = 'check_violation';
  end if;
  if d.alocacao_nova_id is not null and (
       exists (select 1 from apontamentos_diarios a join lote_alocacoes al on al.id = d.alocacao_nova_id
               where a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id and al.periodo @> a.data)
    or exists (select 1 from biometrias b join lote_alocacoes al on al.id = d.alocacao_nova_id
               where b.lote_id = al.lote_id and b.viveiro_id = al.viveiro_id and al.periodo @> b.data)
    or exists (select 1 from lote_alocacoes al where al.id = d.alocacao_nova_id and not upper_inf(al.periodo))) then
    raise exception 'Já há apontamentos, biometrias ou saídas do viveiro depois desta despesca; desfaça-os antes'
      using errcode = 'check_violation';
  end if;

  delete from despescas where id = d.id;   -- o trigger tira os kg do estoque (e recusa se já foram vendidos)
  if d.alocacao_nova_id is not null then
    delete from lote_alocacoes where id = d.alocacao_nova_id;
  end if;
  begin
    update lote_alocacoes set periodo = daterange(lower(periodo), null) where id = d.alocacao_id;
  exception when exclusion_violation then
    select nome into v_viveiro from viveiros where id = d.viveiro_id;
    raise exception 'O viveiro % já recebeu outro lote depois da despesca; transfira esse lote antes de desfazer', v_viveiro
      using errcode = 'check_violation';
  end;
  if v_lote.fase = 'encerrado' then
    update lotes set fase = (select app.fase_do_viveiro(v.finalidade) from viveiros v where v.id = d.viveiro_id),
                     encerrado_em = null, motivo_encerramento = null, updated_at = now()
    where id = d.lote_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Movimentos de estoque com peixe em kg
-- ---------------------------------------------------------------------------
drop function if exists public.ajustar_estoque_peixe(uuid, uuid, bigint, text);
create function public.ajustar_estoque_peixe(p_empresa uuid, p_classe uuid, p_contado numeric, p_observacao text default null)
returns numeric language plpgsql set search_path = public as $$
declare v_dif numeric;
begin
  if p_contado is null or p_contado < 0 then
    raise exception 'Quantidade contada não pode ser negativa' using errcode = 'check_violation';
  end if;
  perform app.travar_estoque(p_empresa);   -- mesma trava em toda função que mexe no saldo
  select round(p_contado, 3) - saldo into v_dif from estoque_peixe where classe_id = p_classe and empresa_id = p_empresa;
  if not found then raise exception 'Classe do pescado não encontrada' using errcode = 'no_data_found'; end if;
  if v_dif <> 0 then
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, created_by)
    values (p_empresa, app.produto_base_peixe(p_classe), app.deposito_peixe(p_empresa), app.hoje(p_empresa), 'ajuste', v_dif,
            coalesce(nullif(trim(p_observacao), ''), 'inventário'), auth.uid());
  end if;
  return v_dif;
end $$;

drop function if exists public.inventariar_ponto(uuid, jsonb, text);
create function public.inventariar_ponto(p_ponto uuid, p_contagem jsonb, p_observacao text default null)
returns numeric language plpgsql set search_path = public as $$
declare
  pv pontos_venda%rowtype;
  r record;
  v_contado numeric;
  v_total numeric := 0;
begin
  select * into pv from pontos_venda where id = p_ponto;
  if not found then raise exception 'Ponto de venda não encontrado' using errcode = 'no_data_found'; end if;
  if pv.sede then raise exception 'Na piscicultura, use a contagem do estoque de pescado' using errcode = 'check_violation'; end if;
  if not app.pode(pv.empresa_id, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_contagem) <> 'object' then raise exception 'Contagem inválida' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(pv.empresa_id);
  for r in select key::uuid as classe_id, value from jsonb_each(p_contagem) loop
    v_contado := nullif(replace(r.value #>> '{}', ',', '.'), '')::numeric;
    continue when v_contado is null;
    if v_contado < 0 then raise exception 'Quantidade contada não pode ser negativa' using errcode = 'check_violation'; end if;
    if not exists (select 1 from classes_peixe where id = r.classe_id and empresa_id = pv.empresa_id) then
      raise exception 'Classe do pescado inválida' using errcode = 'check_violation';
    end if;
    select round(v_contado, 3) - e.saldo into v_contado from estoque_peixe_ponto e
    where e.ponto_venda_id = pv.id and e.classe_id = r.classe_id;
    if v_contado <> 0 then
      insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, observacao, created_by)
      values (pv.empresa_id, app.produto_base_peixe(r.classe_id), pv.deposito_id, app.hoje(pv.empresa_id), 'ajuste', v_contado,
              'inventario_ponto', coalesce(nullif(trim(p_observacao), ''), 'contagem do ponto ' || pv.nome), auth.uid());
      v_total := v_total + v_contado;
    end if;
  end loop;
  return v_total;
end $$;

create or replace function public.movimentar_estoque(p_produto uuid, p_operacao text, p_quantidade numeric,
                                                     p_deposito uuid default null, p_data date default null,
                                                     p_custo_total_cents bigint default null, p_motivo text default null,
                                                     p_lote uuid default null, p_observacao text default null)
returns numeric language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_alvo uuid;
  v_dep uuid;
  v_fator numeric := 1;
  v_qtd numeric;
  v_saldo numeric;
  v_mov numeric;
  v_tipo text;
  v_custo numeric;
begin
  select * into p from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  p_data := coalesce(p_data, app.hoje(p.empresa_id));
  if not app.pode_algum(p.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if p_operacao is null or p_operacao not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Escolha entrada, saída ou ajuste de saldo' using errcode = 'check_violation';
  end if;
  if p_quantidade is null or p_quantidade < 0 or (p_quantidade = 0 and p_operacao <> 'ajuste') then
    raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > app.hoje(p.empresa_id) then
    raise exception 'A data do lançamento não pode ser futura' using errcode = 'check_violation';
  end if;
  if p_lote is not null and not exists (select 1 from lotes where id = p_lote and empresa_id = p.empresa_id) then
    raise exception 'Lote inválido' using errcode = 'check_violation';
  end if;

  if p.tipo = 'peixe' then
    if p.classe_peixe_id is null then raise exception 'Produto de peixe sem classe' using errcode = 'check_violation'; end if;
    v_alvo := app.produto_base_peixe(p.classe_peixe_id);
    v_fator := coalesce(nullif(p.fator_kg, 0), 1);
    v_dep := app.deposito_peixe(p.empresa_id);
  else
    v_alvo := p.id;
    v_dep := coalesce(p_deposito, app.deposito_padrao(p.empresa_id));
    if not exists (select 1 from depositos where id = v_dep and empresa_id = p.empresa_id and tipo <> 'peixe') then
      raise exception 'Depósito inválido' using errcode = 'check_violation';
    end if;
  end if;

  v_qtd := round(p_quantidade * v_fator, 3);
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
  v_saldo := app.saldo_produto(v_alvo, v_dep);

  if p_operacao = 'entrada' then
    v_mov := v_qtd;
    v_tipo := case when p.tipo <> 'peixe' and p_custo_total_cents is not null then 'entrada_compra' else 'ajuste' end;
  elsif p_operacao = 'saida' then
    v_tipo := coalesce(nullif(p_motivo, ''), 'perda');
    if v_tipo not in ('consumo_lote', 'perda', 'ajuste') or (p.tipo = 'peixe' and v_tipo = 'consumo_lote') then
      raise exception 'Motivo de saída inválido' using errcode = 'check_violation';
    end if;
    if v_saldo < v_qtd then
      raise exception 'Saldo insuficiente de %: há % %', p.nome, round(v_saldo / v_fator, 3), p.unidade
        using errcode = 'check_violation';
    end if;
    v_mov := -v_qtd;
  else
    v_mov := v_qtd - v_saldo;
    v_tipo := 'ajuste';
    if v_mov = 0 then return 0; end if;
  end if;

  if p_custo_total_cents is not null and p_custo_total_cents < 0 then
    raise exception 'Custo não pode ser negativo' using errcode = 'check_violation';
  end if;
  v_custo := case
    when p.tipo = 'peixe' then null
    when v_tipo = 'entrada_compra' then p_custo_total_cents::numeric / v_qtd
    else p.custo_medio_cents end;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id,
                                  origem_tabela, observacao, created_by)
  values (p.empresa_id, v_alvo, v_dep, p_data, v_tipo, v_mov, v_custo, case when v_tipo = 'consumo_lote' then p_lote end,
          'lancamento_manual', nullif(trim(p_observacao), ''), auth.uid());
  if v_tipo = 'entrada_compra' then
    perform app.atualizar_custo_medio(v_alvo, v_qtd, v_custo);
  end if;
  return v_mov / v_fator;
end $$;

create or replace function public.registrar_entrada(p_produto uuid, p_deposito uuid, p_data date, p_quantidade numeric,
                                                    p_custo_total_cents bigint, p_observacao text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_id uuid;
begin
  select * into p from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  if p.tipo = 'peixe' then raise exception 'O peixe entra no estoque pela despesca' using errcode = 'check_violation'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation'; end if;
  if not exists (select 1 from depositos where id = p_deposito and empresa_id = p.empresa_id) then
    raise exception 'Depósito inválido' using errcode = 'check_violation';
  end if;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, created_by)
  values (p.empresa_id, p_produto, p_deposito, p_data, 'entrada_compra', p_quantidade, p_custo_total_cents::numeric / p_quantidade,
          nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;
  perform app.atualizar_custo_medio(p_produto, p_quantidade, p_custo_total_cents::numeric / p_quantidade);
  return v_id;
end $$;

create or replace function public.registrar_saida(p_produto uuid, p_deposito uuid, p_data date, p_quantidade numeric,
                                                  p_tipo text default 'consumo_lote', p_lote uuid default null,
                                                  p_observacao text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_id uuid;
begin
  select * into p from produtos where id = p_produto;
  if not found or p.tipo = 'peixe' then raise exception 'Produto inválido' using errcode = 'check_violation'; end if;
  if p_tipo not in ('consumo_lote', 'perda', 'ajuste') then raise exception 'Tipo de saída inválido' using errcode = 'check_violation'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
  if app.saldo_produto(p_produto, p_deposito) < p_quantidade then
    raise exception 'Saldo insuficiente de %: há % %', p.nome, app.saldo_produto(p_produto, p_deposito), p.unidade using errcode = 'check_violation';
  end if;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id, origem_tabela, created_by)
  values (p.empresa_id, p_produto, p_deposito, p_data, p_tipo, -p_quantidade, p.custo_medio_cents, p_lote, nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Pedidos e faturamento
-- ---------------------------------------------------------------------------
create or replace function app.marcar_categoria_sistema() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.nome = 'Venda de peixes' and new.parent_id is null and new.sentido = 'entrada' then
    new.sistema := true;
  end if;
  return new;
end $$;
update categorias set nome = 'Venda de peixes', updated_at = now()
where nome = 'Venda de ovos' and parent_id is null and sentido = 'entrada'
  and not exists (select 1 from categorias x where x.empresa_id = categorias.empresa_id and x.nome = 'Venda de peixes' and x.parent_id is null);
update categorias set sistema = true where nome = 'Venda de peixes' and parent_id is null and sentido = 'entrada';

create or replace function public.criar_pedido(p_empresa uuid, p_cliente uuid, p_itens jsonb, p_data date default null,
                                               p_entrega date default null, p_parcelas jsonb default '[{"pct": 100, "dias": 0}]',
                                               p_forma_pagamento text default null, p_observacoes text default null,
                                               p_client_id uuid default null, p_origem text default 'web')
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_numero int;
  x jsonb;
  v_preco bigint;
  v_prod produtos%rowtype;
begin
  p_data := coalesce(p_data, app.hoje(p_empresa));
  if p_client_id is not null then
    select id into v_id from pedidos_venda where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if not exists (select 1 from contatos where id = p_cliente and empresa_id = p_empresa and 'cliente' = any(tipos)) then
    raise exception 'Cliente inválido' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens' using errcode = 'check_violation';
  end if;
  if (select coalesce(sum((p->>'pct')::numeric), 0) from jsonb_array_elements(p_parcelas) p) <> 100 then
    raise exception 'As parcelas precisam somar 100%%' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('pedido:' || p_empresa::text));
  select coalesce(max(numero), 0) + 1 into v_numero from pedidos_venda where empresa_id = p_empresa;

  insert into pedidos_venda (empresa_id, numero, cliente_id, vendedor_user_id, data, entrega_prevista, condicao_pagamento,
                             forma_pagamento, status, origem, client_id, observacoes)
  values (p_empresa, v_numero, p_cliente, auth.uid(), p_data, p_entrega, jsonb_build_object('parcelas', p_parcelas),
          p_forma_pagamento, 'aberto', p_origem, p_client_id, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  for x in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos where id = (x->>'produto_id')::uuid and empresa_id = p_empresa and ativo;
    if not found then raise exception 'Produto inválido no pedido' using errcode = 'check_violation'; end if;
    if v_prod.tipo = 'peixe' and v_prod.base_estoque is false and v_prod.fator_kg is null then
      raise exception 'Produto % sem kg por unidade', v_prod.nome using errcode = 'check_violation';
    end if;
    v_preco := coalesce((x->>'preco_unit_cents')::bigint, public.preco_vigente(v_prod.id, p_cliente, p_data));
    if v_preco is null then
      raise exception 'Sem preço para % (cadastre na tabela de preços ou informe no pedido)', v_prod.nome using errcode = 'check_violation';
    end if;
    if coalesce((x->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade inválida para %', v_prod.nome using errcode = 'check_violation';
    end if;
    insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unit_cents)
    values (v_id, v_prod.id, (x->>'quantidade')::numeric, v_preco);
  end loop;

  update pedidos_venda set total_cents = (select sum(total_cents) from pedido_itens where pedido_id = v_id) where id = v_id;
  return v_id;
end $$;

create or replace function public.faturar_pedido(p_pedido uuid) returns integer
language plpgsql set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  pv pontos_venda%rowtype;
  r record;
  v_cat uuid;
  v_cc uuid;
  v_cliente text;
  v_n int;
  v_i int := 0;
  v_acum bigint := 0;
  v_valor bigint;
  v_ag uuid;
  x jsonb;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
  if p.status not in ('aberto', 'separado') then
    raise exception 'Pedido % não pode ser faturado', p.status using errcode = 'check_violation';
  end if;
  pv := app.ponto_da_venda(p.empresa_id, p.ponto_venda_id);

  for r in
    select pr.classe_peixe_id, round(sum(i.quantidade * pr.fator_kg), 3) as kg, e.classe, e.disponivel
    from pedido_itens i join produtos pr on pr.id = i.produto_id
    join estoque_peixe_ponto e on e.classe_id = pr.classe_peixe_id and e.ponto_venda_id = pv.id
    where i.pedido_id = p_pedido and pr.tipo = 'peixe'
    group by pr.classe_peixe_id, e.classe, e.disponivel
  loop
    if r.kg > r.disponivel + 0.0005 then
      raise exception 'Estoque insuficiente de peixe %: o pedido precisa de % kg e há % kg%',
        lower(r.classe), r.kg, r.disponivel, case when pv.sede then '' else ' em ' || pv.nome end
        using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, created_by)
    values (p.empresa_id, app.produto_base_peixe(r.classe_peixe_id), pv.deposito_id, app.hoje(p.empresa_id), 'venda', -r.kg,
            'pedidos_venda', p.id, auth.uid());
  end loop;

  select id into v_cat from categorias where empresa_id = p.empresa_id and sentido = 'entrada' and nome = 'Venda de peixes';
  if v_cat is null then
    select id into v_cat from categorias where empresa_id = p.empresa_id and grupo = 'receita_operacional' and sentido = 'entrada' order by nome limit 1;
  end if;
  v_cc := coalesce(pv.centro_custo_id, (select id from centros_custo where empresa_id = p.empresa_id and tipo = 'comercial' order by nome limit 1));
  select nome into v_cliente from contatos where id = p.cliente_id;

  v_n := jsonb_array_length(p.condicao_pagamento->'parcelas');
  for x in select * from jsonb_array_elements(p.condicao_pagamento->'parcelas') loop
    v_i := v_i + 1;
    v_valor := case when v_i = v_n then p.total_cents - v_acum else round(p.total_cents * (x->>'pct')::numeric / 100) end;
    v_acum := v_acum + v_valor;
    continue when v_valor <= 0;
    v_ag := public.agendar_titulo(p.empresa_id, 'receber', format('Pedido %s · %s', p.numero, v_cliente),
      p.data + coalesce((x->>'dias')::int, 0), date_trunc('month', p.data)::date, v_valor,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', v_valor)),
      p.cliente_id, format('Pedido %s', p.numero), 1, p.forma_pagamento);
    update agendamentos set origem = 'pedido_venda', origem_id = p.id,
      parcela_numero = case when v_n > 1 then v_i end, parcela_total = case when v_n > 1 then v_n end
    where id = v_ag;
  end loop;

  update pedidos_venda set status = 'faturado', ponto_venda_id = pv.id, updated_at = now() where id = p_pedido;
  return v_n;
end $$;

create or replace function public.portal_cliente(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c contatos;
  v_hoje date;
begin
  c := app.cliente_do_portal(p_token);
  if c.id is null then return null; end if;
  v_hoje := app.hoje(c.empresa_id);
  return jsonb_build_object(
    'empresa', (select coalesce(nullif(nome_fantasia, ''), razao_social) from empresas where id = c.empresa_id),
    'cliente', c.nome,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'unidade', p.unidade, 'preco_cents', x.preco) order by p.nome)
      from produtos p cross join lateral (select public.preco_vigente(p.id, c.id, v_hoje) as preco) x
      where p.empresa_id = c.empresa_id and p.ativo and not p.base_estoque and p.tipo in ('peixe', 'alevino', 'outro') and x.preco is not null), '[]'),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object('numero', numero, 'data', data, 'entrega', entrega_prevista, 'status', status, 'total_cents', total_cents)
                       order by numero desc)
      from (select * from pedidos_venda where cliente_id = c.id order by numero desc limit 5) u), '[]'));
end $$;

create or replace function public.criar_pedido_portal(p_token text, p_itens jsonb, p_entrega date default null,
                                                      p_observacoes text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c contatos;
  v_hoje date;
  v_itens jsonb;
  v_pedido uuid;
begin
  c := app.cliente_do_portal(p_token);
  if c.id is null then raise exception 'Link de pedido inválido ou desativado' using errcode = 'insufficient_privilege'; end if;
  v_hoje := app.hoje(c.empresa_id);
  if (select count(*) from pedidos_venda where cliente_id = c.id and origem = 'portal' and data = v_hoje) >= 5 then
    raise exception 'Muitos pedidos hoje por este link. Fale com a piscicultura.' using errcode = 'check_violation';
  end if;
  if p_entrega is not null and (p_entrega < v_hoje or p_entrega > v_hoje + 60) then
    raise exception 'Data de entrega fora do prazo' using errcode = 'check_violation';
  end if;
  select jsonb_agg(jsonb_build_object('produto_id', x->>'produto_id', 'quantidade', (x->>'quantidade')::numeric))
  into v_itens
  from jsonb_array_elements(coalesce(p_itens, '[]')) x
  where coalesce((x->>'quantidade')::numeric, 0) > 0
    and exists (select 1 from produtos p where p.id = (x->>'produto_id')::uuid and p.empresa_id = c.empresa_id and p.ativo
                and not p.base_estoque and p.tipo in ('peixe', 'alevino', 'outro'));
  if v_itens is null then raise exception 'Escolha pelo menos um produto' using errcode = 'check_violation'; end if;
  if (select count(*) from jsonb_array_elements(v_itens)) > 30 then raise exception 'Itens demais' using errcode = 'check_violation'; end if;

  v_pedido := public.criar_pedido(c.empresa_id, c.id, v_itens, v_hoje, p_entrega, '[{"dias":0,"pct":100}]', null,
    concat_ws(' ', 'Pedido do cliente pelo link: confira condição e entrega.', left(nullif(trim(p_observacoes), ''), 500)), null, 'portal');
  return (select numero from pedidos_venda where id = v_pedido);
end $$;

create or replace function public.criar_ponto_venda(p_empresa uuid, p_nome text, p_tipo text default 'loja',
                                                    p_municipio text default null, p_uf text default null,
                                                    p_endereco text default null, p_documento text default null,
                                                    p_inscricao_estadual text default null, p_criar_caixa boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
  v_dep uuid;
  v_caixa uuid;
  v_cc uuid;
  v_id uuid;
begin
  if not app.pode_algum(p_empresa, array['estoque.editar', 'configuracoes.editar']) then
    raise exception 'Seu usuário não tem permissão para cadastrar pontos de venda' using errcode = 'insufficient_privilege';
  end if;
  if v_nome = '' then raise exception 'Informe o nome do ponto de venda' using errcode = 'check_violation'; end if;
  perform app.ponto_sede(p_empresa);
  if exists (select 1 from pontos_venda where empresa_id = p_empresa and lower(nome) = lower(v_nome)) then
    raise exception 'Já existe um ponto de venda chamado %', v_nome using errcode = 'check_violation';
  end if;

  insert into depositos (empresa_id, nome, tipo) values (p_empresa, left('Pescado · ' || v_nome, 120), 'peixe')
  returning id into v_dep;
  if p_criar_caixa then
    insert into contas_financeiras (empresa_id, tipo, nome) values (p_empresa, 'caixinha', left('Caixa · ' || v_nome, 120))
    returning id into v_caixa;
  end if;
  select id into v_cc from centros_custo where empresa_id = p_empresa and lower(nome) = lower('Ponto · ' || v_nome);
  if v_cc is null then
    insert into centros_custo (empresa_id, nome, tipo, parent_id)
    values (p_empresa, 'Ponto · ' || v_nome, 'comercial',
            (select id from centros_custo where empresa_id = p_empresa and tipo = 'comercial' and parent_id is null order by nome limit 1))
    returning id into v_cc;
  end if;

  insert into pontos_venda (empresa_id, nome, tipo, deposito_id, conta_caixa_id, centro_custo_id, municipio, uf, endereco,
                            documento, inscricao_estadual)
  values (p_empresa, v_nome, coalesce(nullif(p_tipo, ''), 'loja'), v_dep, v_caixa, v_cc, nullif(trim(p_municipio), ''),
          nullif(upper(trim(p_uf)), ''), nullif(trim(p_endereco), ''), nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), ''),
          nullif(trim(p_inscricao_estadual), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Transferência de pescado entre pontos e compra dentro do grupo (kg)
-- ---------------------------------------------------------------------------
alter table transferencias_peixe drop constraint transferencias_peixe_quebrados_check;
alter table transferencias_peixe alter column kg_enviados type numeric(14,3);
alter table transferencias_peixe alter column kg_recebidos type numeric(14,3);
alter table transferencias_peixe alter column quebrados type numeric(14,3);
alter table transferencias_peixe rename column quebrados to perda_kg;
alter table transferencias_peixe add constraint transferencias_peixe_perda_kg_check check (perda_kg >= 0);
comment on column transferencias_peixe.perda_kg is 'Kg perdidos no transporte (quebra de peso, peixe estragado)';

alter table transferencia_peixe_itens drop constraint quebra_ate_o_enviado;
alter table transferencia_peixe_itens drop constraint transferencia_peixe_itens_quebrados_check;
alter table transferencia_peixe_itens alter column kg_enviados type numeric(14,3);
alter table transferencia_peixe_itens alter column quebrados type numeric(14,3);
alter table transferencia_peixe_itens rename column quebrados to perda_kg;
alter table transferencia_peixe_itens add constraint transferencia_peixe_itens_perda_kg_check check (perda_kg >= 0);
alter table transferencia_peixe_itens add constraint perda_ate_o_enviado check (perda_kg <= kg_enviados);

alter table compras_grupo alter column ovos type numeric(14,3);
alter table compras_grupo rename column ovos to kg;

drop function if exists public.transferir_peixe(uuid, uuid, uuid, date, jsonb, bigint, boolean, uuid, date, boolean, text);
create function public.transferir_peixe(p_empresa uuid, p_origem uuid, p_destino uuid, p_data date, p_itens jsonb,
                                        p_frete_cents bigint default 0, p_frete_a_pagar boolean default true,
                                        p_transportador uuid default null, p_vencimento_frete date default null,
                                        p_receber boolean default true, p_observacoes text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  o pontos_venda%rowtype;
  d pontos_venda%rowtype;
  v_id uuid;
  v_numero int;
  v_total numeric := 0;
  v_cat uuid;
  v_cc uuid;
  v_ag uuid;
  r record;
begin
  p_data := coalesce(p_data, app.hoje(p_empresa));
  p_frete_cents := coalesce(p_frete_cents, 0);
  if not app.pode(p_empresa, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para transferir estoque' using errcode = 'insufficient_privilege';
  end if;
  select * into o from pontos_venda where id = p_origem and empresa_id = p_empresa;
  select * into d from pontos_venda where id = p_destino and empresa_id = p_empresa;
  if o.id is null or d.id is null then raise exception 'Ponto de venda inválido' using errcode = 'check_violation'; end if;
  if o.id = d.id then raise exception 'Escolha um destino diferente da origem' using errcode = 'check_violation'; end if;
  if not o.ativo or not d.ativo then raise exception 'Ponto de venda inativo' using errcode = 'check_violation'; end if;
  if p_data > app.hoje(p_empresa) then
    raise exception 'A data da transferência não pode ser futura' using errcode = 'check_violation';
  end if;
  if p_frete_cents < 0 then raise exception 'Frete não pode ser negativo' using errcode = 'check_violation'; end if;
  if p_frete_cents > 0 and p_frete_a_pagar and not app.pode(p_empresa, 'contas-a-pagar.editar') then
    raise exception 'Para lançar o frete em contas a pagar seu usuário precisa dessa permissão; desmarque a opção ou peça a quem tem'
      using errcode = 'insufficient_privilege';
  end if;
  if p_transportador is not null and not exists (select 1 from contatos where id = p_transportador and empresa_id = p_empresa) then
    raise exception 'Transportador inválido' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe o peixe que vai na transferência' using errcode = 'check_violation';
  end if;

  -- Converte cada item para kg da classe
  create temp table if not exists _transf_itens (classe_peixe_id uuid, kg numeric) on commit drop;
  truncate _transf_itens;
  insert into _transf_itens
  select pr.classe_peixe_id, round((x->>'quantidade')::numeric * coalesce(nullif(pr.fator_kg, 0), 1), 3)
  from jsonb_array_elements(p_itens) x
  left join produtos pr on pr.id = (x->>'produto_id')::uuid and pr.empresa_id = p_empresa and pr.tipo = 'peixe';
  if exists (select 1 from _transf_itens where classe_peixe_id is null) then
    raise exception 'Só pescado pode ser transferido entre pontos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from _transf_itens where kg is null or kg <= 0) then
    raise exception 'Quantidade inválida na transferência' using errcode = 'check_violation';
  end if;

  perform app.travar_estoque(p_empresa);
  for r in
    select t.classe_peixe_id, sum(t.kg) as kg, e.classe, e.disponivel
    from _transf_itens t
    join estoque_peixe_ponto e on e.classe_id = t.classe_peixe_id and e.ponto_venda_id = o.id
    group by t.classe_peixe_id, e.classe, e.disponivel
  loop
    if r.kg > r.disponivel + 0.0005 then
      raise exception 'Estoque insuficiente de peixe % em %: a transferência leva % kg e há % kg', lower(r.classe), o.nome, r.kg, r.disponivel
        using errcode = 'check_violation';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('transferencia_peixe:' || p_empresa::text));
  select coalesce(max(numero), 0) + 1 into v_numero from transferencias_peixe where empresa_id = p_empresa;
  select sum(kg) into v_total from _transf_itens;

  insert into transferencias_peixe (empresa_id, numero, data, origem_id, destino_id, kg_enviados, frete_cents, transportador_id, observacoes)
  values (p_empresa, v_numero, p_data, o.id, d.id, v_total, p_frete_cents, p_transportador, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  insert into transferencia_peixe_itens (empresa_id, transferencia_id, classe_peixe_id, kg_enviados)
  select p_empresa, v_id, classe_peixe_id, sum(kg) from _transf_itens group by classe_peixe_id;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, observacao, created_by)
  select p_empresa, app.produto_base_peixe(i.classe_peixe_id), o.deposito_id, p_data, 'transferencia', -i.kg_enviados,
         'transferencias_peixe', v_id, format('Transferência %s para %s', v_numero, d.nome), auth.uid()
  from transferencia_peixe_itens i where i.transferencia_id = v_id;

  if p_frete_cents > 0 and p_frete_a_pagar then
    select id into v_cat from categorias where empresa_id = p_empresa and sentido = 'saida' and nome = 'Fretes';
    if v_cat is null then
      select id into v_cat from categorias where empresa_id = p_empresa and sentido = 'saida' and grupo = 'custo_operacional' order by nome limit 1;
    end if;
    v_cc := coalesce(d.centro_custo_id, (select id from centros_custo where empresa_id = p_empresa and tipo = 'comercial' order by nome limit 1));
    v_ag := public.agendar_titulo(p_empresa, 'pagar', format('Frete da transferência %s · %s → %s', v_numero, o.nome, d.nome),
      coalesce(p_vencimento_frete, p_data), date_trunc('month', p_data)::date, p_frete_cents,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', p_frete_cents)),
      p_transportador, format('Transferência %s', v_numero), 1, null);
    update agendamentos set origem = 'transferencia_peixe', origem_id = v_id where id = v_ag;
    update transferencias_peixe set frete_titulo_id = v_ag where id = v_id;
  end if;

  if p_receber then
    perform public.receber_transferencia_peixe(v_id, null, p_data);
  end if;
  return v_id;
end $$;

drop function if exists public.receber_transferencia_peixe(uuid, jsonb, date);
create function public.receber_transferencia_peixe(p_transferencia uuid, p_perdas jsonb default null, p_data date default null)
returns numeric language plpgsql set search_path = public as $$
declare
  t transferencias_peixe%rowtype;
  d pontos_venda%rowtype;
  v_perda numeric;
  v_recebidos numeric;
  v_custo numeric;
begin
  select * into t from transferencias_peixe where id = p_transferencia for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'no_data_found'; end if;
  if not app.pode(t.empresa_id, 'estoque.editar') then
    raise exception 'Seu usuário não tem permissão para receber transferências' using errcode = 'insufficient_privilege';
  end if;
  if t.status <> 'em_transito' then
    raise exception 'Esta transferência já foi %', case t.status when 'recebida' then 'recebida' else 'cancelada' end
      using errcode = 'check_violation';
  end if;
  p_data := coalesce(p_data, app.hoje(t.empresa_id));
  if p_data < t.data or p_data > app.hoje(t.empresa_id) then
    raise exception 'A data do recebimento precisa estar entre a saída e hoje' using errcode = 'check_violation';
  end if;
  if p_perdas is not null and jsonb_typeof(p_perdas) <> 'object' then
    raise exception 'Perdas inválidas' using errcode = 'check_violation';
  end if;
  if p_perdas is not null and exists (select 1 from jsonb_object_keys(p_perdas) k
      where not exists (select 1 from transferencia_peixe_itens i where i.transferencia_id = t.id and i.classe_peixe_id::text = k)) then
    raise exception 'Perda numa classe que não foi na transferência' using errcode = 'check_violation';
  end if;
  select * into d from pontos_venda where id = t.destino_id;

  update transferencia_peixe_itens i
  set perda_kg = round(coalesce(nullif(replace(p_perdas->>(i.classe_peixe_id::text), ',', '.'), '')::numeric, 0), 3)
  where i.transferencia_id = t.id;
  select sum(perda_kg), sum(kg_enviados - perda_kg) into v_perda, v_recebidos
  from transferencia_peixe_itens where transferencia_id = t.id;

  v_custo := case when t.frete_cents > 0 and v_recebidos > 0 then t.frete_cents::numeric / v_recebidos end;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, origem_id,
                                  observacao, created_by)
  select t.empresa_id, app.produto_base_peixe(i.classe_peixe_id), d.deposito_id, p_data, 'transferencia', i.kg_enviados, v_custo,
         'transferencias_peixe', t.id, format('Transferência %s recebida', t.numero), auth.uid()
  from transferencia_peixe_itens i where i.transferencia_id = t.id;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, observacao, created_by)
  select t.empresa_id, app.produto_base_peixe(i.classe_peixe_id), d.deposito_id, p_data, 'perda', -i.perda_kg,
         'transferencias_peixe', t.id, format('Perda no transporte da transferência %s', t.numero), auth.uid()
  from transferencia_peixe_itens i where i.transferencia_id = t.id and i.perda_kg > 0;

  update transferencias_peixe
  set status = 'recebida', recebida_em = p_data, kg_recebidos = v_recebidos, perda_kg = v_perda, updated_at = now()
  where id = t.id;
  return v_recebidos;
end $$;

drop function if exists public.resumo_pontos_venda(uuid, date, date);
create function public.resumo_pontos_venda(p_empresa uuid, p_inicio date, p_fim date)
returns table (ponto_venda_id uuid, nome text, sede boolean, vendas integer, vendido_cents bigint, kg_vendidos numeric,
               kg_recebidos numeric, perda_kg numeric, frete_cents bigint)
language sql stable set search_path = public as $$
  select pv.id, pv.nome, pv.sede,
         coalesce(v.vendas, 0)::int, coalesce(v.valor, 0)::bigint, coalesce(v.kg, 0),
         coalesce(t.recebidos, 0), coalesce(t.perda, 0), coalesce(t.frete, 0)::bigint
  from pontos_venda pv
  left join (
    select coalesce(p.ponto_venda_id, (select s.id from pontos_venda s where s.empresa_id = p.empresa_id and s.sede)) as ponto,
           count(*) as vendas, sum(p.total_cents) as valor, sum(coalesce(p.kg, 0)) as kg
    from pedidos p
    where p.empresa_id = p_empresa and p.status in ('faturado', 'entregue') and p.data between p_inicio and p_fim
    group by 1
  ) v on v.ponto = pv.id
  left join (
    select destino_id, sum(kg_recebidos) as recebidos, sum(perda_kg) as perda, sum(frete_cents) as frete
    from transferencias_peixe
    where empresa_id = p_empresa and status = 'recebida' and recebida_em between p_inicio and p_fim
    group by destino_id
  ) t on t.destino_id = pv.id
  where pv.empresa_id = p_empresa
  order by pv.sede desc, pv.nome
$$;

create or replace function public.receber_compra_do_grupo(p_pedido uuid, p_empresa uuid, p_ponto uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  origem empresas%rowtype;
  destino empresas%rowtype;
  pv pontos_venda%rowtype;
  v_doc text;
  v_forn uuid;
  v_cat uuid;
  v_cc uuid;
  v_id uuid;
  v_ponto uuid;
  v_kg numeric := 0;
  v_ag uuid;
  r record;
  t record;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.empresa_id = p_empresa then raise exception 'Escolha a empresa que comprou, não a que vendeu' using errcode = 'check_violation'; end if;
  if not app.pode(p.empresa_id, 'vendas.ver') then
    raise exception 'Seu usuário não tem acesso às vendas da empresa que vendeu' using errcode = 'insufficient_privilege';
  end if;
  if not app.pode(p_empresa, 'estoque.editar') or not app.pode(p_empresa, 'contas-a-pagar.editar') then
    raise exception 'Para lançar a compra seu usuário precisa lançar estoque e contas a pagar na empresa que comprou'
      using errcode = 'insufficient_privilege';
  end if;
  if p.status not in ('faturado', 'entregue') then
    raise exception 'Fature o pedido antes de lançar a entrada na outra empresa' using errcode = 'check_violation';
  end if;
  select * into origem from empresas where id = p.empresa_id;
  select * into destino from empresas where id = p_empresa;
  select cpf_cnpj into v_doc from contatos where id = p.cliente_id;
  if v_doc is distinct from destino.cnpj then
    raise exception 'O cliente deste pedido não é a empresa % (o documento não bate)', coalesce(destino.nome_fantasia, destino.razao_social)
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from compras_grupo where pedido_origem_id = p.id) then
    raise exception 'A entrada deste pedido já foi lançada' using errcode = 'check_violation';
  end if;

  v_ponto := coalesce(p_ponto, app.ponto_sede(p_empresa));
  select * into pv from pontos_venda where id = v_ponto and empresa_id = p_empresa;
  if not found or not pv.ativo then raise exception 'Ponto de venda inválido' using errcode = 'check_violation'; end if;

  -- A piscicultura como fornecedora na loja, pelo documento
  select id into v_forn from contatos where empresa_id = p_empresa and cpf_cnpj = origem.cnpj;
  if v_forn is null then
    insert into contatos (empresa_id, tipos, nome, cpf_cnpj, produtor_rural)
    values (p_empresa, '{fornecedor}', coalesce(origem.nome_fantasia, origem.razao_social), origem.cnpj, length(origem.cnpj) = 11)
    returning id into v_forn;
  else
    update contatos set tipos = array_append(tipos, 'fornecedor') where id = v_forn and not ('fornecedor' = any(tipos));
  end if;

  insert into compras_grupo (empresa_id, empresa_origem_id, pedido_origem_id, pedido_numero, fornecedor_id, ponto_venda_id, data, total_cents)
  values (p_empresa, p.empresa_id, p.id, p.numero, v_forn, pv.id, app.hoje(p_empresa), p.total_cents)
  returning id into v_id;

  -- Pescado: mesma classe (pelo nome) na loja, ao preço por kg da venda
  perform app.travar_estoque(p_empresa);
  for r in
    select c.nome, round(sum(i.quantidade * pr.fator_kg), 3) as kg, sum(i.total_cents) as valor
    from pedido_itens i join produtos pr on pr.id = i.produto_id join classes_peixe c on c.id = pr.classe_peixe_id
    where i.pedido_id = p.id and pr.tipo = 'peixe'
    group by c.nome
  loop
    select id into t from classes_peixe where empresa_id = p_empresa and lower(nome) = lower(r.nome);
    if not found then
      raise exception 'A empresa % não tem a classe de pescado %. Cadastre a classe e tente de novo',
        coalesce(destino.nome_fantasia, destino.razao_social), r.nome using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, origem_id,
                                    observacao, created_by)
    values (p_empresa, app.produto_base_peixe(t.id), pv.deposito_id, app.hoje(p_empresa), 'entrada_compra', r.kg, r.valor::numeric / r.kg,
            'compras_grupo', v_id, format('Compra do pedido %s de %s', p.numero, coalesce(origem.nome_fantasia, origem.razao_social)), auth.uid());
    v_kg := v_kg + r.kg;
  end loop;
  update compras_grupo set kg = v_kg where id = v_id;

  -- Contas a pagar espelhando as parcelas da venda
  select id into v_cat from categorias where empresa_id = p_empresa and sentido = 'saida' and nome = 'Compra de peixe para revenda';
  if v_cat is null then
    insert into categorias (empresa_id, grupo, sentido, nome) values (p_empresa, 'custo_operacional', 'saida', 'Compra de peixe para revenda')
    returning id into v_cat;
  end if;
  v_cc := coalesce(pv.centro_custo_id, (select id from centros_custo where empresa_id = p_empresa and tipo = 'comercial' order by nome limit 1));
  for t in
    select a.vencimento, a.valor_cents, a.parcela_numero, a.parcela_total from agendamentos a
    where a.origem = 'pedido_venda' and a.origem_id = p.id and a.status <> 'cancelado' order by a.vencimento
  loop
    v_ag := public.agendar_titulo(p_empresa, 'pagar',
      format('Compra pedido %s · %s%s', p.numero, coalesce(origem.nome_fantasia, origem.razao_social),
             case when t.parcela_total > 1 then format(' (%s/%s)', t.parcela_numero, t.parcela_total) else '' end),
      t.vencimento, date_trunc('month', p.data)::date, t.valor_cents,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', t.valor_cents)),
      v_forn, format('Pedido %s', p.numero), 1, p.forma_pagamento);
    update agendamentos set origem = 'compra', origem_id = v_id where id = v_ag;
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Empresa: sem unidade de venda de ovos; qualidade da água no apontamento ligada por padrão
-- ---------------------------------------------------------------------------
alter table empresas drop constraint empresas_unidade_ovo_check;
alter table empresas drop constraint empresas_exibir_ovos_check;
alter table empresas drop column unidade_ovo;
alter table empresas drop column exibir_ovos;
alter table empresas alter column apontar_qualidade_agua set default true;
update empresas set apontar_qualidade_agua = true;
comment on column empresas.apontar_qualidade_agua is 'O apontamento do viveiro pede a qualidade da água (oxigênio, temperatura, pH, transparência, amônia)';

-- produto de venda: o tipo de importação aceito deixa de ter ovo (o pescado vem das classes)
do $$
declare v text;
begin
  v := pg_get_functiondef('public.importar_pacote(uuid, jsonb)'::regprocedure);
  if position($q$'vacina','peixe','outro'$q$ in v) = 0 then
    raise exception 'importar_pacote mudou: revise a troca do tipo de produto';
  end if;
  v := replace(v, $q$'vacina','peixe','outro'$q$, $q$'vacina','alevino','outro'$q$);
  v := replace(v, '-- Produtos e insumos: pelo nome; ovo vem das classes de ovo, não da importação.',
                  '-- Produtos e insumos: pelo nome; o pescado vem das classes, não da importação.');
  execute v;
end $$;

grant execute on function app.nome_pescado(text), app.deposito_peixe(uuid), app.classe_sem_classificacao(uuid) to authenticated;
revoke all on function public.registrar_despesca(uuid, uuid, date, text, numeric, integer, jsonb, text, uuid, uuid),
  public.desfazer_despesca(uuid) from public, anon;
grant execute on function public.registrar_despesca(uuid, uuid, date, text, numeric, integer, jsonb, text, uuid, uuid),
  public.desfazer_despesca(uuid) to authenticated;
revoke all on function public.ajustar_estoque_peixe(uuid, uuid, numeric, text),
  public.inventariar_ponto(uuid, jsonb, text),
  public.transferir_peixe(uuid, uuid, uuid, date, jsonb, bigint, boolean, uuid, date, boolean, text),
  public.receber_transferencia_peixe(uuid, jsonb, date),
  public.resumo_pontos_venda(uuid, date, date) from public, anon;
grant execute on function public.ajustar_estoque_peixe(uuid, uuid, numeric, text),
  public.inventariar_ponto(uuid, jsonb, text),
  public.transferir_peixe(uuid, uuid, uuid, date, jsonb, bigint, boolean, uuid, date, boolean, text),
  public.receber_transferencia_peixe(uuid, jsonb, date),
  public.resumo_pontos_venda(uuid, date, date) to authenticated;

select app.travar_referencias();
