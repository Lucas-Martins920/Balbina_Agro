-- Tabelas de preço com nome, no jeito do NIBO: cada empresa tem uma tabela padrão, que vale para todos os
-- produtos e clientes, e quantas outras quiser (atacado, varejo, revenda…). Uma tabela pode ter preço próprio
-- por produto ou um ajuste em % sobre a padrão para o que não tiver preço próprio. O cliente pode ficar
-- ligado a uma tabela; o preço especial do cliente continua vencendo tudo.
--
-- Os preços continuam em tabelas_preco (com vigência e histórico), agora com lista_id.
-- Ordem do preço de um produto: especial do cliente > tabela escolhida na venda (ou a do cliente) > padrão
-- (com o ajuste da tabela escolhida, quando ela não tem preço próprio).

-- ---------------------------------------------------------------------------
-- 1. Cabeçalho das tabelas
-- ---------------------------------------------------------------------------

create table listas_preco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  padrao boolean not null default false,
  ajuste_pct numeric(6,2) not null default 0 check (ajuste_pct > -100 and ajuste_pct <= 1000),
  ativa boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome),
  check (not padrao or (ativa and ajuste_pct = 0))
);
create unique index listas_preco_uma_padrao on listas_preco (empresa_id) where padrao;

alter table listas_preco enable row level security;
create policy membros on listas_preco
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on listas_preco as restrictive for insert with check (app.pode(empresa_id, 'vendas.precos'));
create policy escrita_alterar on listas_preco as restrictive for update
  using (app.pode(empresa_id, 'vendas.precos')) with check (app.pode(empresa_id, 'vendas.precos'));
create policy escrita_apagar on listas_preco as restrictive for delete using (app.pode(empresa_id, 'vendas.precos'));

-- Só uma padrão: marcar outra tira a marca da anterior. A padrão não sai nem deixa de ser padrão sozinha.
create or replace function app.protege_lista_preco() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- pg_trigger_depth() > 1: a empresa está sendo excluída e leva tudo junto
    if old.padrao and pg_trigger_depth() = 1 then
      raise exception 'A tabela padrão não pode ser excluída. Marque outra como padrão antes.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  new.nome := btrim(new.nome);
  if new.padrao then
    new.ativa := true;
    new.ajuste_pct := 0;
    if tg_op = 'INSERT' or not old.padrao then
      update listas_preco set padrao = false where empresa_id = new.empresa_id and padrao and id <> new.id;
    end if;
  elsif tg_op = 'UPDATE' and old.padrao and pg_trigger_depth() = 1 then
    raise exception 'Sempre há uma tabela padrão. Para trocar, marque outra tabela como padrão.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger protege_lista_preco before insert or update or delete on listas_preco
  for each row execute function app.protege_lista_preco();

-- Toda empresa nasce com a tabela padrão
create or replace function app.lista_preco_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into listas_preco (empresa_id, nome, padrao) values (new.id, 'Tabela padrão', true);
  return new;
end $$;
create trigger lista_preco_inicial after insert on empresas
  for each row execute function app.lista_preco_inicial();

insert into listas_preco (empresa_id, nome, padrao)
select e.id, 'Tabela padrão', true from empresas e
where not exists (select 1 from listas_preco l where l.empresa_id = e.id and l.padrao);

-- ---------------------------------------------------------------------------
-- 2. Preços passam a pertencer a uma tabela
-- ---------------------------------------------------------------------------

alter table tabelas_preco add column lista_id uuid references listas_preco(id) on delete cascade;
update tabelas_preco t set lista_id = l.id from listas_preco l where l.empresa_id = t.empresa_id and l.padrao;
alter table tabelas_preco alter column lista_id set not null;
create index on tabelas_preco (lista_id, produto_id);

do $$
declare v_nome text;
begin
  for v_nome in select conname from pg_constraint where conrelid = 'public.tabelas_preco'::regclass and contype = 'x' loop
    execute format('alter table tabelas_preco drop constraint %I', v_nome);
  end loop;
end $$;
alter table tabelas_preco add constraint tabelas_preco_sem_sobreposicao exclude using gist (
  lista_id with =, produto_id with =,
  (coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  vigencia with &&);

-- Sem tabela informada, o preço vai para a padrão. Preço especial de cliente só existe na padrão.
create or replace function app.preco_na_lista() returns trigger language plpgsql as $$
declare v_padrao boolean;
begin
  if new.lista_id is null then
    select id into new.lista_id from listas_preco where empresa_id = new.empresa_id and padrao;
  end if;
  select padrao into v_padrao from listas_preco where id = new.lista_id and empresa_id = new.empresa_id;
  if not found then
    raise exception 'Tabela de preço não encontrada' using errcode = 'foreign_key_violation';
  end if;
  if new.cliente_id is not null and not v_padrao then
    raise exception 'Preço especial de cliente fica na tabela padrão' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from produtos where id = new.produto_id and empresa_id = new.empresa_id) then
    raise exception 'Produto não encontrado' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
create trigger preco_na_lista before insert or update on tabelas_preco
  for each row execute function app.preco_na_lista();

-- ---------------------------------------------------------------------------
-- 3. Tabela do cliente
-- ---------------------------------------------------------------------------

alter table contatos add column lista_preco_id uuid references listas_preco(id) on delete set null;

create or replace function app.contato_lista_preco() returns trigger language plpgsql as $$
begin
  if new.lista_preco_id is not null
     and not exists (select 1 from listas_preco where id = new.lista_preco_id and empresa_id = new.empresa_id) then
    raise exception 'Tabela de preço não encontrada' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
create trigger contato_lista_preco before insert or update of lista_preco_id on contatos
  for each row execute function app.contato_lista_preco();

-- ---------------------------------------------------------------------------
-- 4. Preço vigente, definir e remover preço, salvar a tabela inteira
-- ---------------------------------------------------------------------------

drop function public.preco_vigente(uuid, uuid, date);
create function public.preco_vigente(p_produto uuid, p_cliente uuid default null, p_data date default current_date, p_lista uuid default null)
returns bigint language plpgsql stable set search_path = public as $$
declare
  v_emp uuid;
  v_lista uuid;
  v_ajuste numeric := 0;
  v_preco bigint;
begin
  select empresa_id into v_emp from produtos where id = p_produto;
  if v_emp is null then return null; end if;

  if p_cliente is not null then
    select preco_cents into v_preco from tabelas_preco
    where produto_id = p_produto and cliente_id = p_cliente and vigencia @> p_data;
    if found then return v_preco; end if;
  end if;

  select l.id, l.ajuste_pct into v_lista, v_ajuste from listas_preco l
  where l.empresa_id = v_emp and l.ativa and not l.padrao
    and l.id = coalesce(p_lista, (select c.lista_preco_id from contatos c where c.id = p_cliente));
  if v_lista is not null then
    select preco_cents into v_preco from tabelas_preco
    where lista_id = v_lista and produto_id = p_produto and cliente_id is null and vigencia @> p_data;
    if found then return v_preco; end if;
  end if;

  select t.preco_cents into v_preco from tabelas_preco t join listas_preco l on l.id = t.lista_id and l.padrao
  where t.produto_id = p_produto and t.cliente_id is null and t.vigencia @> p_data;
  if v_preco is null then return null; end if;
  return round(v_preco * (1 + coalesce(v_ajuste, 0) / 100.0))::bigint;
end $$;

-- Novo preço a partir de uma data (encerra o anterior e guarda o histórico). Sem tabela, vai para a padrão.
drop function public.definir_preco(uuid, bigint, uuid, date);
create function public.definir_preco(p_produto uuid, p_preco_cents bigint, p_cliente uuid default null,
                                     p_desde date default current_date, p_lista uuid default null)
returns void language plpgsql set search_path = public as $$
declare v_emp uuid; v_lista uuid;
begin
  select empresa_id into v_emp from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  if p_preco_cents is null or p_preco_cents < 0 then raise exception 'Preço inválido' using errcode = 'check_violation'; end if;
  select id into v_lista from listas_preco where empresa_id = v_emp and (id = p_lista or (p_lista is null and padrao));
  if v_lista is null then raise exception 'Tabela de preço não encontrada' using errcode = 'no_data_found'; end if;
  delete from tabelas_preco where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente
    and lower(vigencia) >= p_desde;
  update tabelas_preco set vigencia = daterange(lower(vigencia), p_desde)
  where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente and vigencia @> p_desde;
  insert into tabelas_preco (empresa_id, lista_id, produto_id, cliente_id, preco_cents, vigencia)
  values (v_emp, v_lista, p_produto, p_cliente, p_preco_cents, daterange(p_desde, null));
end $$;

-- Tira o produto da tabela a partir da data (o histórico fica). Sem preço próprio, vale a padrão com o ajuste.
create function public.remover_preco(p_produto uuid, p_lista uuid default null, p_cliente uuid default null, p_desde date default current_date)
returns void language plpgsql set search_path = public as $$
declare v_lista uuid;
begin
  select l.id into v_lista from listas_preco l join produtos p on p.empresa_id = l.empresa_id
  where p.id = p_produto and (l.id = p_lista or (p_lista is null and l.padrao));
  if v_lista is null then raise exception 'Tabela de preço não encontrada' using errcode = 'no_data_found'; end if;
  delete from tabelas_preco where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente
    and lower(vigencia) >= p_desde;
  update tabelas_preco set vigencia = daterange(lower(vigencia), p_desde)
  where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente and vigencia @> p_desde;
end $$;

-- Salva cabeçalho e preços numa transação. p_precos: [{produto_id, preco_cents|null}] (null tira o produto da tabela).
-- Só mexe no que mudou, para o histórico não ganhar linhas à toa.
create function public.salvar_tabela_preco(
  p_empresa uuid,
  p_id uuid,
  p_nome text,
  p_padrao boolean default false,
  p_ativa boolean default true,
  p_ajuste_pct numeric default 0,
  p_observacoes text default null,
  p_precos jsonb default '[]'
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_atual bigint;
  v_novo bigint;
  x jsonb;
begin
  if p_id is null then
    insert into listas_preco (empresa_id, nome, padrao, ativa, ajuste_pct, observacoes)
    values (p_empresa, p_nome, coalesce(p_padrao, false), coalesce(p_ativa, true), coalesce(p_ajuste_pct, 0), nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update listas_preco set nome = p_nome, ativa = coalesce(p_ativa, true), ajuste_pct = coalesce(p_ajuste_pct, 0),
      observacoes = nullif(btrim(p_observacoes), ''),
      -- tirar a marca de padrão só acontece marcando outra
      padrao = padrao or coalesce(p_padrao, false)
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;
    if v_id is null then raise exception 'Tabela de preço não encontrada' using errcode = 'no_data_found'; end if;
  end if;

  for x in select * from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) loop
    v_novo := (x->>'preco_cents')::bigint;
    select preco_cents into v_atual from tabelas_preco
    where lista_id = v_id and produto_id = (x->>'produto_id')::uuid and cliente_id is null and vigencia @> current_date;
    if not found then v_atual := null; end if;
    if v_novo is null and v_atual is not null then
      perform public.remover_preco((x->>'produto_id')::uuid, v_id);
    elsif v_novo is not null and v_novo is distinct from v_atual then
      perform public.definir_preco((x->>'produto_id')::uuid, v_novo, null, current_date, v_id);
    end if;
  end loop;
  return v_id;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.preco_vigente(uuid, uuid, date, uuid) to authenticated;
    grant execute on function public.definir_preco(uuid, bigint, uuid, date, uuid) to authenticated;
    grant execute on function public.remover_preco(uuid, uuid, uuid, date) to authenticated;
    grant execute on function public.salvar_tabela_preco(uuid, uuid, text, boolean, boolean, numeric, text, jsonb) to authenticated;
    grant select, insert, update, delete on listas_preco to authenticated;
  end if;
end $$;
