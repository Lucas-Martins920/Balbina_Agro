-- Ordem das categorias e dos centros de custo, escolhida pela piscicultura arrastando na lista (como no NIBO).
--
-- A ordem vale entre irmãos:
-- * categorias principais: dentro do mesmo grupo do DRE;
-- * subcategorias: dentro da categoria principal;
-- * centros de custo: dentro do mesmo centro pai (ou na raiz).
-- Quem mostra uma lista plana monta a árvore e percorre os irmãos pela ordem (src/lib/ordem.ts).

alter table categorias add column ordem integer;
alter table centros_custo add column ordem integer;

-- Valores iniciais: a ordem que as telas já mostravam (alfabética).
update categorias c set ordem = o.n
from (
  select id, row_number() over (
    partition by empresa_id, parent_id, case when parent_id is null then grupo end
    order by nome, created_at, id) as n
  from categorias
) o
where o.id = c.id;

update centros_custo c set ordem = o.n
from (
  select id, row_number() over (partition by empresa_id, parent_id order by nome, created_at, id) as n
  from centros_custo
) o
where o.id = c.id;

-- Item novo, ou que mudou de pai (ou de grupo, se for categoria principal), vai para o fim dos novos irmãos.
create or replace function app.categoria_no_fim() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.ordem is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id
     and (new.parent_id is not null or new.grupo = old.grupo) then
    return new;
  end if;
  select coalesce(max(ordem), 0) + 1 into new.ordem
  from categorias
  where empresa_id = new.empresa_id and id <> new.id
    and parent_id is not distinct from new.parent_id
    and (new.parent_id is not null or grupo = new.grupo);
  return new;
end $$;
-- "zz": roda depois do protege_categoria_sistema, que acerta grupo e sentido da subcategoria
create trigger zz_categoria_no_fim before insert or update of parent_id, grupo on categorias
  for each row execute function app.categoria_no_fim();

create or replace function app.centro_custo_no_fim() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.ordem is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;
  select coalesce(max(ordem), 0) + 1 into new.ordem
  from centros_custo
  where empresa_id = new.empresa_id and id <> new.id and parent_id is not distinct from new.parent_id;
  return new;
end $$;
create trigger zz_centro_custo_no_fim before insert or update of parent_id on centros_custo
  for each row execute function app.centro_custo_no_fim();

alter table categorias alter column ordem set not null;
alter table centros_custo alter column ordem set not null;

-- Grava a nova ordem de um grupo de irmãos: a posição no array vira a ordem (1, 2, 3...).
-- Roda como quem chama (security invoker): o RLS só deixa mexer em quem pode editar o cadastro da empresa.
-- Devolve quantos itens foram gravados; menos que o pedido = sem permissão ou item de outra empresa.
create or replace function public.reordenar_categorias(p_ids uuid[]) returns integer
language plpgsql set search_path = public as $$
declare
  v_n integer;
begin
  if (select count(distinct (parent_id, case when parent_id is null then grupo end, empresa_id))
      from categorias where id = any(p_ids)) > 1 then
    raise exception 'Só dá para reordenar categorias do mesmo nível' using errcode = 'check_violation';
  end if;
  update categorias c set ordem = o.n
  from unnest(p_ids) with ordinality as o(id, n)
  where c.id = o.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.reordenar_centros_custo(p_ids uuid[]) returns integer
language plpgsql set search_path = public as $$
declare
  v_n integer;
begin
  if (select count(distinct (parent_id, empresa_id)) from centros_custo where id = any(p_ids)) > 1 then
    raise exception 'Só dá para reordenar centros de custo do mesmo nível' using errcode = 'check_violation';
  end if;
  update centros_custo c set ordem = o.n
  from unnest(p_ids) with ordinality as o(id, n)
  where c.id = o.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.reordenar_categorias(uuid[]) from public;
revoke all on function public.reordenar_centros_custo(uuid[]) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.reordenar_categorias(uuid[]) to authenticated;
    grant execute on function public.reordenar_centros_custo(uuid[]) to authenticated;
  end if;
end $$;

-- Subcategoria de custo pode ter o seu próprio componente no custo do kg (antes só a principal tinha).
-- A view categorias_custo já usava o da subcategoria quando houvesse: coalesce(filha, pai, 'outros').
