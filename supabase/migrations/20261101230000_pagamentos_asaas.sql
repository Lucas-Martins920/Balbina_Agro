-- C7 do estudo de automação (docs/estudo-automacao.html): pagar boletos pelo sistema, pela conta Asaas da piscicultura.
--
-- Risco alto (dinheiro saindo), então tudo travado por padrão:
--   - desligado até o master ligar em Configurações › Automações (pagamentos_ligado), com limite por dia;
--   - quem lança contas a pagar PROPÕE (propor_pagamentos); só o master APROVA (aprovar_pagamentos), com o
--     segundo fator em dia (app.pode já exige), e não pode aprovar o que ele mesmo propôs, salvo se a empresa
--     ligar a aprovação por uma pessoa só (empresa com um usuário);
--   - aprovar marca 'enviado' antes de chamar o Asaas: um clique duplo não paga duas vezes;
--   - a baixa só entra quando o Asaas confirma o pagamento (rotina conferindo os enviados).
-- Nesta primeira versão só boleto (linha digitável na conta a pagar). Pix para chave fica para depois.

alter table automacoes_empresa
  add column pagamentos_ligado boolean not null default false,
  add column pagamento_limite_dia_cents bigint not null default 500000 check (pagamento_limite_dia_cents between 0 and 100000000000),
  add column pagamento_aprovacao_unica boolean not null default false;

-- Só o master liga, desliga ou muda o limite dos pagamentos (configuracoes.editar não basta).
create or replace function app.pagamentos_so_master() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.pagamentos_ligado, new.pagamento_limite_dia_cents, new.pagamento_aprovacao_unica)
         is distinct from (case when tg_op = 'UPDATE' then (old.pagamentos_ligado, old.pagamento_limite_dia_cents, old.pagamento_aprovacao_unica)
                                else (false, 500000::bigint, false) end)
     and not exists (select 1 from usuarios_empresa u where u.empresa_id = new.empresa_id and u.user_id = auth.uid() and u.ativo and u.is_admin) then
    raise exception 'Só o usuário master muda os pagamentos pelo sistema' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger pagamentos_so_master before insert or update on automacoes_empresa
  for each row execute function app.pagamentos_so_master();

create table pagamentos_saida (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  agendamento_id uuid not null references agendamentos(id) on delete restrict,
  perfil_cobranca_id uuid not null references perfis_cobranca(id) on delete restrict,
  linha text not null check (linha ~ '^\d{47,48}$'),
  valor_cents bigint not null check (valor_cents > 0),
  data_pagamento date not null,
  status text not null default 'proposto' check (status in ('proposto', 'enviado', 'pago', 'falhou', 'cancelado')),
  proposto_por uuid default auth.uid(),
  aprovado_por uuid,
  aprovado_em timestamptz,
  id_externo text,
  status_externo text,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pagamentos_saida_um_ativo on pagamentos_saida (agendamento_id) where status in ('proposto', 'enviado');
create index on pagamentos_saida (agendamento_id);
create index on pagamentos_saida (perfil_cobranca_id);
create index on pagamentos_saida (empresa_id, status, created_at desc);
alter table pagamentos_saida enable row level security;
create policy membros on pagamentos_saida using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy leitura on pagamentos_saida as restrictive for select using (empresa_id in (select app.empresas_onde_pode('contas-a-pagar.ver')));
-- escrita só pelas funções abaixo
create policy sem_inserir on pagamentos_saida as restrictive for insert with check (false);
create policy sem_alterar on pagamentos_saida as restrictive for update using (false);
create policy sem_apagar on pagamentos_saida as restrictive for delete using (false);

create or replace function app.perfil_asaas(p_empresa uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from perfis_cobranca where empresa_id = p_empresa and provedor = 'asaas' and ativo order by created_at limit 1
$$;
revoke all on function app.perfil_asaas(uuid) from public;

-- Propõe o pagamento das contas a pagar escolhidas (as que têm linha digitável de boleto). Devolve quantas.
create or replace function public.propor_pagamentos(p_empresa uuid, p_titulos uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_perfil uuid;
  v_n int;
begin
  if not app.pode(p_empresa, 'contas-a-pagar.editar') then
    raise exception 'Seu usuário não pode lançar contas a pagar' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce((select pagamentos_ligado from automacoes_empresa where empresa_id = p_empresa), false) then
    raise exception 'O pagamento pelo sistema não está ligado (Configurações › Automações)' using errcode = 'check_violation';
  end if;
  v_perfil := app.perfil_asaas(p_empresa);
  if v_perfil is null then raise exception 'Conecte a conta Asaas da piscicultura em Cobranças' using errcode = 'check_violation'; end if;
  if cardinality(coalesce(p_titulos, '{}')) > 100 then raise exception 'No máximo 100 contas por vez' using errcode = 'check_violation'; end if;

  insert into pagamentos_saida (empresa_id, agendamento_id, perfil_cobranca_id, linha, valor_cents, data_pagamento)
  select a.empresa_id, a.id, v_perfil, a.referencia, a.valor_cents - a.desconto_cents - a.pago_cents, greatest(a.vencimento, app.hoje(p_empresa))
  from agendamentos a
  where a.id = any(p_titulos) and a.empresa_id = p_empresa and a.tipo = 'pagar' and a.status in ('aberto', 'parcial')
    and a.referencia ~ '^\d{47,48}$' and a.valor_cents - a.desconto_cents - a.pago_cents > 0
    and not exists (select 1 from pagamentos_saida p where p.agendamento_id = a.id and p.status in ('proposto', 'enviado'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.cancelar_pagamento(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p pagamentos_saida;
begin
  select * into p from pagamentos_saida where id = p_id for update;
  if p.id is null or not app.pode(p.empresa_id, 'contas-a-pagar.editar') then
    raise exception 'Pagamento não encontrado' using errcode = 'insufficient_privilege';
  end if;
  if p.status <> 'proposto' then raise exception 'Só dá para cancelar o que ainda não foi aprovado' using errcode = 'check_violation'; end if;
  update pagamentos_saida set status = 'cancelado', updated_at = now() where id = p_id;
end $$;

-- Aprova e marca como enviados (antes de chamar o Asaas). Devolve o que o servidor deve mandar ao Asaas.
create or replace function public.aprovar_pagamentos(p_empresa uuid, p_ids uuid[])
returns table (id uuid, perfil_cobranca_id uuid, linha text, valor_cents bigint, data_pagamento date, descricao text)
language plpgsql security definer set search_path = public as $$
declare
  cfg automacoes_empresa;
  v_lote bigint;
  v_hoje bigint;
begin
  if not app.pode(p_empresa, 'contas-a-pagar.editar')
     or not exists (select 1 from usuarios_empresa u where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo and u.is_admin) then
    raise exception 'Só o usuário master, com o segundo fator em dia, aprova pagamentos' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from automacoes_empresa a where a.empresa_id = p_empresa;
  if not coalesce(cfg.pagamentos_ligado, false) then
    raise exception 'O pagamento pelo sistema não está ligado (Configurações › Automações)' using errcode = 'check_violation';
  end if;
  perform 1 from pagamentos_saida p where p.empresa_id = p_empresa and p.id = any(p_ids) for update;
  if exists (select 1 from pagamentos_saida p where p.empresa_id = p_empresa and p.id = any(p_ids) and p.status <> 'proposto') then
    raise exception 'Algum pagamento já foi aprovado ou cancelado. Recarregue a página.' using errcode = 'check_violation';
  end if;
  if not cfg.pagamento_aprovacao_unica and exists (
    select 1 from pagamentos_saida p where p.empresa_id = p_empresa and p.id = any(p_ids) and p.proposto_por = auth.uid()) then
    raise exception 'Quem propôs o pagamento não pode aprovar: peça a outra pessoa (ou ligue a aprovação por uma pessoa só)' using errcode = 'check_violation';
  end if;
  select coalesce(sum(p.valor_cents), 0) into v_lote from pagamentos_saida p where p.empresa_id = p_empresa and p.id = any(p_ids);
  select coalesce(sum(p.valor_cents), 0) into v_hoje from pagamentos_saida p
  where p.empresa_id = p_empresa and p.status in ('enviado', 'pago')
    and (p.aprovado_em at time zone (select fuso from empresas where empresas.id = p_empresa))::date = app.hoje(p_empresa);
  if v_lote = 0 then raise exception 'Escolha os pagamentos' using errcode = 'check_violation'; end if;
  if v_hoje + v_lote > cfg.pagamento_limite_dia_cents then
    raise exception 'Passa do limite de pagamentos do dia (R$ %)', to_char(cfg.pagamento_limite_dia_cents / 100.0, 'FM999G999G990D00')
      using errcode = 'check_violation';
  end if;

  return query
  update pagamentos_saida p set status = 'enviado', aprovado_por = auth.uid(), aprovado_em = now(), updated_at = now()
  from agendamentos a
  where p.empresa_id = p_empresa and p.id = any(p_ids) and a.id = p.agendamento_id
  returning p.id, p.perfil_cobranca_id, p.linha, p.valor_cents, p.data_pagamento, a.descricao;
end $$;

-- Resposta do Asaas ao envio, gravada por quem aprovou: o id do pagamento ou a recusa. Sem resposta (rede caiu)
-- não dá para saber se pagou: fica 'enviado' com o aviso para conferir no Asaas (p_incerto).
create or replace function public.registrar_envio_pagamento(p_id uuid, p_id_externo text, p_erro text, p_incerto boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update pagamentos_saida set id_externo = p_id_externo, erro = left(p_erro, 500),
         status = case when p_id_externo is null and p_erro is not null and not p_incerto then 'falhou' else status end, updated_at = now()
  where id = p_id and status = 'enviado' and aprovado_por = auth.uid() and id_externo is null;
  if not found then raise exception 'Pagamento não encontrado' using errcode = 'insufficient_privilege'; end if;
end $$;

-- Servidor (rotina): enviados para conferir no Asaas.
create or replace function public.pagamentos_para_conferir()
returns table (id uuid, perfil_cobranca_id uuid, id_externo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.perfil_cobranca_id, p.id_externo from pagamentos_saida p
  where p.status = 'enviado' and p.id_externo is not null
  order by p.updated_at limit 200
$$;

-- Servidor (rotina): situação do Asaas. Pago vira baixa na conta do Asaas; falha, cancelamento ou estorno
-- fecham o pagamento sem baixa.
create or replace function public.atualizar_pagamento_saida(p_id uuid, p_status text, p_data date, p_motivo text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  p pagamentos_saida;
  t titulos;
  v_conta uuid;
begin
  select * into p from pagamentos_saida where id = p_id for update;
  if p.id is null or p.status <> 'enviado' then return 'ignorado'; end if;
  if p_status = 'PAID' then
    select conta_repasse_id into v_conta from perfis_cobranca where id = p.perfil_cobranca_id;
    if v_conta is null then
      update pagamentos_saida set status_externo = p_status, erro = 'Pago no Asaas, mas o perfil não tem conta de repasse: dê a baixa à mão', updated_at = now() where id = p_id;
      return 'sem_conta';
    end if;
    select * into t from titulos where titulos.id = p.agendamento_id;
    if t.status in ('aberto', 'parcial') and t.saldo_cents > 0 then
      insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao)
      values (p.empresa_id, p.agendamento_id, v_conta, coalesce(p_data, app.hoje(p.empresa_id)), least(p.valor_cents, t.saldo_cents),
              greatest(p.valor_cents - t.saldo_cents, 0), 'Pago pelo Balbina (Asaas ' || p.id_externo || ')');
    end if;
    update pagamentos_saida set status = 'pago', status_externo = p_status, erro = null, updated_at = now() where id = p_id;
    return 'pago';
  elsif p_status in ('FAILED', 'CANCELLED', 'REFUNDED') then
    update pagamentos_saida set status = 'falhou', status_externo = p_status, erro = left(coalesce(p_motivo, p_status), 500), updated_at = now() where id = p_id;
    return 'falhou';
  end if;
  update pagamentos_saida set status_externo = p_status, updated_at = now() where id = p_id;
  return 'aguardando';
end $$;

revoke all on function public.propor_pagamentos(uuid, uuid[]), public.cancelar_pagamento(uuid), public.aprovar_pagamentos(uuid, uuid[]),
  public.registrar_envio_pagamento(uuid, text, text, boolean), public.pagamentos_para_conferir(), public.atualizar_pagamento_saida(uuid, text, date, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.propor_pagamentos(uuid, uuid[]), public.cancelar_pagamento(uuid), public.aprovar_pagamentos(uuid, uuid[]),
      public.registrar_envio_pagamento(uuid, text, text, boolean), public.pagamentos_para_conferir(), public.atualizar_pagamento_saida(uuid, text, date, text) from anon;
    grant execute on function public.propor_pagamentos(uuid, uuid[]), public.cancelar_pagamento(uuid), public.aprovar_pagamentos(uuid, uuid[]),
      public.registrar_envio_pagamento(uuid, text, text, boolean) to authenticated;
    grant execute on function public.pagamentos_para_conferir(), public.atualizar_pagamento_saida(uuid, text, date, text) to service_role;
  end if;
end $$;

select app.travar_referencias();
