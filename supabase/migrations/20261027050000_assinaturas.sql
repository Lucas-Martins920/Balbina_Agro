-- Assinatura do Balbina (venda como SaaS).
-- Cada empresa só acessa os dados com teste grátis vigente, mensalidade paga (com 5 dias de carência)
-- ou cortesia. O bloqueio fica no banco: app.minhas_empresas() e app.pode() deixam de enxergar a empresa
-- sem acesso, então todas as policies e RPCs param juntas. A tabela empresas continua visível para o app
-- mostrar a tela de pagamento.
-- A cobrança é feita pelo Asaas da conta do Balbina (BALBINA_ASAAS_*), separada do Asaas das pisciculturas.

create table planos (
  id text primary key,
  nome text not null,
  descricao text,
  valor_cents bigint not null check (valor_cents > 0),
  ciclo text not null check (ciclo in ('mensal', 'anual')),
  ativo boolean not null default true,
  ordem int not null default 0
);

-- Valores iniciais: ajuste em Table Editor > planos antes de vender.
insert into planos (id, nome, descricao, valor_cents, ciclo, ordem) values
  ('mensal', 'Mensal', 'Todos os módulos, usuários ilimitados', 24900, 'mensal', 1),
  ('anual', 'Anual', 'Todos os módulos, usuários ilimitados, 2 meses grátis', 249000, 'anual', 2);

create table assinaturas (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  plano_id text references planos(id),
  status text not null default 'teste'
    check (status in ('teste', 'aguardando', 'ativa', 'atrasada', 'cancelada', 'cortesia')),
  teste_ate date,
  pago_ate date,                -- último dia coberto por pagamento confirmado
  asaas_cliente_id text,
  asaas_assinatura_id text unique,
  fatura_url text,              -- fatura em aberto, para o botão "Pagar"
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function app.hoje_brasil() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Regra única de acesso. Carência de 5 dias depois do período pago.
create or replace function app.assinatura_libera(p_status text, p_teste_ate date, p_pago_ate date) returns boolean
language sql stable as $$
  select p_status = 'cortesia'
      or coalesce(p_teste_ate >= app.hoje_brasil(), false)
      or coalesce(p_pago_ate + 5 >= app.hoje_brasil(), false)
$$;

create or replace function app.empresa_liberada(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assinaturas a
                 where a.empresa_id = p_empresa and app.assinatura_libera(a.status, a.teste_ate, a.pago_ate))
$$;

-- Empresas de que o usuário participa, pagas ou não (tela de pagamento, seletor de empresa).
create or replace function app.empresas_vinculadas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios_empresa where user_id = auth.uid() and ativo
$$;

-- Daqui em diante, só as empresas com acesso liberado. Todas as policies "membros" usam esta função.
create or replace function app.minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.empresa_id from usuarios_empresa u
  join assinaturas a on a.empresa_id = u.empresa_id
  where u.user_id = auth.uid() and u.ativo and app.assinatura_libera(a.status, a.teste_ate, a.pago_ate)
$$;

create or replace function app.pode(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app.empresa_liberada(p_empresa) and exists (
    select 1 from usuarios_empresa u
    where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
      and (u.is_admin or u.perfil = 'sem_restricao' or exists (
        select 1 from unnest(app.permissoes_perfil(u.perfil) || u.permissoes) c
        where c = p_perm
           or (p_perm like '%.ver' and (c = '*.ver' or split_part(c, '.', 1) = split_part(p_perm, '.', 1)))))
  )
$$;

drop policy membros on empresas;
create policy membros on empresas for select using (id in (select app.empresas_vinculadas()));

-- Empresa nova ganha 14 dias de teste.
create or replace function app.assinatura_inicial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into assinaturas (empresa_id, status, teste_ate) values (new.id, 'teste', app.hoje_brasil() + 14)
  on conflict (empresa_id) do nothing;
  return new;
end $$;

create trigger assinatura_inicial after insert on empresas
for each row execute function app.assinatura_inicial();

-- Empresas que já existiam: 30 dias de teste a partir de hoje.
insert into assinaturas (empresa_id, status, teste_ate)
select id, 'teste', app.hoje_brasil() + 30 from empresas
on conflict (empresa_id) do nothing;

alter table planos enable row level security;
create policy leitura on planos for select to authenticated using (ativo);

-- Só leitura para os membros; quem grava é o servidor (service role), depois de falar com o Asaas.
alter table assinaturas enable row level security;
create policy membros on assinaturas for select using (empresa_id in (select app.empresas_vinculadas()));
revoke insert, update, delete on assinaturas, planos from anon, authenticated;

-- Situação da assinatura para o app decidir entre a tela normal e a de pagamento.
create or replace function minha_assinatura(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', a.status,
    'liberada', app.assinatura_libera(a.status, a.teste_ate, a.pago_ate),
    'teste_ate', a.teste_ate,
    'pago_ate', a.pago_ate,
    'plano_id', a.plano_id,
    'fatura_url', a.fatura_url,
    'tem_assinatura', a.asaas_assinatura_id is not null)
  from assinaturas a
  where a.empresa_id = p_empresa and p_empresa in (select app.empresas_vinculadas())
$$;

-- Aviso do Asaas do Balbina sobre uma cobrança da assinatura. Chamado só pelo webhook (service role).
create or replace function registrar_evento_assinatura(p_assinatura text, p_evento text, p_vencimento date, p_fatura_url text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  a assinaturas;
  v_ciclo text;
begin
  select * into a from assinaturas where asaas_assinatura_id = p_assinatura for update;
  if not found then return false; end if;
  select ciclo into v_ciclo from planos where id = a.plano_id;

  if p_evento in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
    update assinaturas set
      status = case when status = 'cortesia' then status else 'ativa' end,
      pago_ate = greatest(pago_ate, (p_vencimento + case when v_ciclo = 'anual' then interval '1 year' else interval '1 month' end)::date - 1),
      fatura_url = case when fatura_url = p_fatura_url then null else fatura_url end,
      updated_at = now()
    where empresa_id = a.empresa_id;
  elsif p_evento = 'PAYMENT_OVERDUE' then
    update assinaturas set status = case when status in ('cortesia', 'cancelada') then status else 'atrasada' end,
      fatura_url = coalesce(p_fatura_url, fatura_url), updated_at = now()
    where empresa_id = a.empresa_id;
  elsif p_evento in ('PAYMENT_CREATED', 'PAYMENT_UPDATED') then
    update assinaturas set fatura_url = coalesce(p_fatura_url, fatura_url), updated_at = now() where empresa_id = a.empresa_id;
  elsif p_evento in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE') then
    -- estorno: o período daquela cobrança deixa de valer
    update assinaturas set pago_ate = least(pago_ate, p_vencimento - 1),
      status = case when status in ('cortesia', 'cancelada') then status else 'atrasada' end, updated_at = now()
    where empresa_id = a.empresa_id;
  elsif p_evento in ('SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED') then
    update assinaturas set status = case when status = 'cortesia' then status else 'cancelada' end, fatura_url = null, updated_at = now()
    where empresa_id = a.empresa_id;
  else
    return false;
  end if;
  return true;
end $$;

revoke execute on function registrar_evento_assinatura(text, text, date, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function registrar_evento_assinatura(text, text, date, text) to service_role;
  end if;
end $$;
