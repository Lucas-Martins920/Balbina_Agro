-- Automações de vendas e fiscal (D1, D2, D4 e E3 do estudo docs/estudo-automacao.html).
--
-- D1 faturamento_completo: "Faturar agora" também emite a NF-e e gera o boleto/Pix (feito no app).
-- D2 pedidos_fixos: cliente que compra sempre nos mesmos dias ganha o pedido gerado sozinho na véspera,
--    em aberto, para conferir as quantidades e faturar.
-- D4 bloqueio de venda a prazo para quem tem conta vencida há mais de N dias (a régua de lembretes
--    fica na tela de cobranças, com mensagem pronta para o WhatsApp e a segunda via).
-- E3 regras_fiscais: CFOP, situação do ICMS e texto da nota escolhidos sozinhos por produto, cliente e
--    destino, conforme a tabela combinada com o contador.

alter table automacoes_empresa
  add column faturamento_completo boolean not null default false,
  add column bloquear_prazo_inadimplente boolean not null default false,
  add column inadimplencia_dias smallint not null default 15 check (inadimplencia_dias between 1 and 180),
  add column pedidos_fixos_hora time not null default '16:00';

-- E3 ------------------------------------------------------------------------------------------------
create table regras_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  produto_id uuid references produtos(id) on delete cascade,
  contato_id uuid references contatos(id) on delete cascade,
  destino text not null default 'qualquer' check (destino in ('qualquer', 'dentro', 'fora')),
  destinatario text not null default 'qualquer' check (destinatario in ('qualquer', 'contribuinte', 'nao_contribuinte')),
  cfop text check (cfop is null or cfop ~ '^\d{4}$'),
  icms_situacao text check (icms_situacao is null or icms_situacao ~ '^\d{2,3}$'),
  texto text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  check (cfop is not null or icms_situacao is not null or nullif(trim(texto), '') is not null)
);
create index on regras_fiscais (empresa_id);
create index on regras_fiscais (produto_id);
create index on regras_fiscais (contato_id);
alter table regras_fiscais enable row level security;
create policy membros on regras_fiscais using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on regras_fiscais as restrictive for insert with check (app.pode(empresa_id, 'notas.editar'));
create policy escrita_alterar on regras_fiscais as restrictive for update
  using (app.pode(empresa_id, 'notas.editar')) with check (app.pode(empresa_id, 'notas.editar'));
create policy escrita_apagar on regras_fiscais as restrictive for delete using (app.pode(empresa_id, 'notas.editar'));

-- os itens da nota passam a levar o produto, para a regra fiscal achar o item
create or replace view nfe_itens with (security_invoker = true) as
select p.id as pedido_id, p.empresa_id, row_number() over (partition by p.id order by pr.nome, i.id) as numero_item,
       coalesce(pr.sku, left(replace(pr.id::text, '-', ''), 12)) as codigo, pr.nome as descricao,
       regexp_replace(coalesce(pr.ncm, '04072100'), '\D', '', 'g') as ncm, pr.cfop_padrao, pr.unidade,
       i.quantidade, i.preco_unit_cents, i.desconto_cents, i.total_cents, pr.id as produto_id
from pedidos_venda p
join pedido_itens i on i.pedido_id = p.id
join produtos pr on pr.id = i.produto_id;

-- D2 ------------------------------------------------------------------------------------------------
create table pedidos_fixos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_id uuid not null references contatos(id) on delete cascade,
  dias_semana smallint[] not null check (cardinality(dias_semana) > 0 and dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]),
  itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) > 0),
  parcelas jsonb not null default '[{"dias":0,"pct":100}]',
  forma_pagamento text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on pedidos_fixos (empresa_id);
create index on pedidos_fixos (cliente_id);
alter table pedidos_fixos enable row level security;
create policy membros on pedidos_fixos using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on pedidos_fixos as restrictive for insert with check (app.pode(empresa_id, 'vendas.lancar'));
create policy escrita_alterar on pedidos_fixos as restrictive for update
  using (app.pode(empresa_id, 'vendas.lancar')) with check (app.pode(empresa_id, 'vendas.lancar'));
create policy escrita_apagar on pedidos_fixos as restrictive for delete using (app.pode(empresa_id, 'vendas.lancar'));

create table pedidos_fixos_gerados (
  pedido_fixo_id uuid not null references pedidos_fixos(id) on delete cascade,
  entrega date not null,
  empresa_id uuid not null references empresas(id) on delete cascade,
  pedido_id uuid references pedidos_venda(id) on delete set null,
  erro text,
  created_at timestamptz not null default now(),
  primary key (pedido_fixo_id, entrega)
);
create index on pedidos_fixos_gerados (empresa_id);
create index on pedidos_fixos_gerados (pedido_id);
alter table pedidos_fixos_gerados enable row level security;
create policy membros on pedidos_fixos_gerados for select using (empresa_id in (select app.minhas_empresas()));

-- Gera, depois da hora escolhida, os pedidos de amanhã. Um por pedido fixo e data; erro (sem preço,
-- produto inativo) fica anotado e não trava os outros. Só o servidor chama.
create or replace function public.gerar_pedidos_fixos()
returns table (empresa_id uuid, gerados int, erros int)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  f record;
  v_amanha date;
  v_pedido uuid;
  v_g int;
  v_e int;
begin
  for r in select a.empresa_id as emp, a.pedidos_fixos_hora, e.fuso from automacoes_empresa a join empresas e on e.id = a.empresa_id
           where app.empresa_liberada(a.empresa_id) and app.plano_inclui(a.empresa_id, 'vendas')
             and exists (select 1 from pedidos_fixos x where x.empresa_id = a.empresa_id and x.ativo) loop
    continue when (now() at time zone r.fuso)::time < r.pedidos_fixos_hora;
    v_amanha := (now() at time zone r.fuso)::date + 1;
    v_g := 0; v_e := 0;
    for f in select * from pedidos_fixos x where x.empresa_id = r.emp and x.ativo
             and extract(dow from v_amanha)::smallint = any(x.dias_semana)
             and not exists (select 1 from pedidos_fixos_gerados g where g.pedido_fixo_id = x.id and g.entrega = v_amanha) loop
      begin
        v_pedido := public.criar_pedido(r.emp, f.cliente_id, f.itens, v_amanha - 1, v_amanha, f.parcelas, f.forma_pagamento,
          concat_ws(' ', 'Pedido fixo: confira as quantidades.', f.observacoes),
          md5(f.id::text || v_amanha::text)::uuid);
        insert into pedidos_fixos_gerados (pedido_fixo_id, entrega, empresa_id, pedido_id) values (f.id, v_amanha, r.emp, v_pedido);
        v_g := v_g + 1;
      exception when others then
        insert into pedidos_fixos_gerados (pedido_fixo_id, entrega, empresa_id, erro) values (f.id, v_amanha, r.emp, sqlerrm);
        v_e := v_e + 1;
      end;
    end loop;
    if v_g + v_e > 0 then
      empresa_id := r.emp; gerados := v_g; erros := v_e;
      return next;
    end if;
  end loop;
end $$;
revoke all on function public.gerar_pedidos_fixos() from public;

-- D4 ------------------------------------------------------------------------------------------------
create or replace function app.bloqueia_prazo_inadimplente() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dias int;
  v_hoje date;
  v_vencida date;
begin
  if not exists (select 1 from jsonb_array_elements(coalesce(new.condicao_pagamento->'parcelas', '[]')) p where (p->>'dias')::int > 0) then
    return new;
  end if;
  select a.inadimplencia_dias into v_dias from automacoes_empresa a where a.empresa_id = new.empresa_id and a.bloquear_prazo_inadimplente;
  if v_dias is null then return new; end if;
  v_hoje := app.hoje(new.empresa_id);
  select min(a.vencimento) into v_vencida from agendamentos a
  where a.empresa_id = new.empresa_id and a.contato_id = new.cliente_id and a.tipo = 'receber'
    and a.status in ('aberto', 'parcial') and a.vencimento < v_hoje - v_dias;
  if v_vencida is not null then
    raise exception 'Cliente com conta vencida desde %: venda só à vista até acertar', to_char(v_vencida, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger bloqueia_prazo_inadimplente before insert on pedidos_venda
  for each row execute function app.bloqueia_prazo_inadimplente();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.gerar_pedidos_fixos() from anon, authenticated;
    grant execute on function public.gerar_pedidos_fixos() to service_role;
    grant select on nfe_itens to authenticated;
  end if;
end $$;

select app.travar_referencias();
