-- H2 do estudo de automação (docs/estudo-automacao.html): WhatsApp do Balbina (API oficial da Meta).
--
-- Um número do Balbina para todas as pisciculturas. Cada pessoa liga o próprio celular ao usuário dela na empresa
-- (whatsapp_vinculos): pede um código na tela e manda "Balbina 123456" do celular para o número do Balbina.
-- Com o celular ligado:
--   - os avisos que hoje vão por push (lembrete de apontamento, resumo do dia, notas de compra...) também
--     chegam no WhatsApp, só para quem tem acesso ao assunto (whatsapp_destinos);
--   - foto ou PDF de boleto, nota ou recibo mandado ao número cai em Boletos e notas por foto (C3/C4) e
--     XML de NF-e em Notas de compra (whatsapp_remetente diz de que empresa é).
-- Régua de cobrança automática (D4): com whatsapp_cobranca ligado, o lembrete sai sozinho para o cliente
-- antes do vencimento, no dia e na primeira semana de atraso, uma vez por fase (whatsapp_cobrancas).

-- Celular do Brasil: 55 + DDD + número. A Meta às vezes manda o celular antigo sem o 9 da frente, então a
-- comparação usa DDD + 8 últimos dígitos.
create or replace function app.chave_celular(p_numero text) returns text
language sql immutable set search_path = public as $$
  select case when d ~ '^55\d{10,11}$' then substr(d, 3, 2) || right(d, 8) end
  from (select regexp_replace(coalesce(p_numero, ''), '\D', '', 'g') as d) x
$$;

create table whatsapp_vinculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  telefone text not null check (telefone ~ '^55\d{10,11}$'),
  chave text generated always as (app.chave_celular(telefone)) stored,
  codigo text check (codigo is null or codigo ~ '^\d{6}$'),
  codigo_expira timestamptz,
  confirmado_em timestamptz,
  avisos boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);
-- Um celular confirmado fala por uma empresa só (a última que ele confirmou).
create unique index whatsapp_vinculos_chave_confirmada on whatsapp_vinculos (chave) where confirmado_em is not null;
alter table whatsapp_vinculos enable row level security;
create policy membros on whatsapp_vinculos using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
-- Cada pessoa vê e apaga só o próprio celular. Criar e confirmar só pelas funções abaixo.
create policy proprio on whatsapp_vinculos as restrictive for select using (user_id = (select auth.uid()));
create policy sem_inserir on whatsapp_vinculos as restrictive for insert with check (false);
create policy sem_alterar on whatsapp_vinculos as restrictive for update using (false);
create policy apagar_proprio on whatsapp_vinculos as restrictive for delete using (user_id = (select auth.uid()));

-- Código de 6 dígitos para a pessoa mandar do celular. Vale 30 minutos; pedir de novo troca o código.
create or replace function public.whatsapp_pedir_codigo(p_empresa uuid, p_telefone text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_codigo text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if auth.uid() is null or p_empresa not in (select app.minhas_empresas()) then
    raise exception 'Empresa não encontrada' using errcode = 'insufficient_privilege';
  end if;
  if length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
  if v_tel !~ '^55\d{10,11}$' then raise exception 'Celular inválido: informe DDD e número' using errcode = 'check_violation'; end if;
  insert into whatsapp_vinculos (empresa_id, user_id, telefone, codigo, codigo_expira)
  values (p_empresa, auth.uid(), v_tel, v_codigo, now() + interval '30 minutes')
  on conflict (empresa_id, user_id) do update
    set telefone = excluded.telefone, codigo = excluded.codigo, codigo_expira = excluded.codigo_expira,
        confirmado_em = case when whatsapp_vinculos.chave = app.chave_celular(excluded.telefone) then whatsapp_vinculos.confirmado_em end;
  return v_codigo;
end $$;

create or replace function public.whatsapp_avisos(p_empresa uuid, p_ligar boolean)
returns void
language sql security definer set search_path = public as $$
  update whatsapp_vinculos set avisos = p_ligar where empresa_id = p_empresa and user_id = auth.uid()
$$;

-- Servidor (webhook): confirma o código vindo do mesmo celular informado na tela.
create or replace function public.whatsapp_confirmar(p_de text, p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v whatsapp_vinculos;
begin
  select * into v from whatsapp_vinculos
  where codigo = p_codigo and codigo_expira > now() and chave = app.chave_celular(p_de)
  order by codigo_expira desc limit 1 for update;
  if v.id is null then return null; end if;
  update whatsapp_vinculos set confirmado_em = null where chave = v.chave and confirmado_em is not null and id <> v.id;
  update whatsapp_vinculos set confirmado_em = now(), codigo = null, codigo_expira = null, avisos = true where id = v.id;
  return jsonb_build_object('empresa_id', v.empresa_id,
    'empresa', (select coalesce(nullif(nome_fantasia, ''), razao_social) from empresas where id = v.empresa_id));
end $$;

-- Servidor (webhook): de quem é o celular que mandou a mensagem.
create or replace function public.whatsapp_remetente(p_de text)
returns table (empresa_id uuid, user_id uuid, empresa text, pode_documentos boolean)
language sql stable security definer set search_path = public as $$
  select v.empresa_id, v.user_id, coalesce(nullif(e.nome_fantasia, ''), e.razao_social),
         app.usuario_pode(v.empresa_id, v.user_id, 'contas-a-pagar.editar')
  from whatsapp_vinculos v join empresas e on e.id = v.empresa_id
  where v.chave = app.chave_celular(p_de) and v.confirmado_em is not null and app.empresa_liberada(v.empresa_id)
    and exists (select 1 from usuarios_empresa u where u.empresa_id = v.empresa_id and u.user_id = v.user_id and u.ativo)
$$;

-- Servidor: liga/desliga os avisos pelo próprio WhatsApp (SAIR / VOLTAR).
create or replace function public.whatsapp_avisos_por_numero(p_de text, p_ligar boolean)
returns boolean
language sql security definer set search_path = public as $$
  with u as (update whatsapp_vinculos set avisos = p_ligar
             where chave = app.chave_celular(p_de) and confirmado_em is not null returning 1)
  select exists (select 1 from u)
$$;

-- Servidor: celulares que recebem um aviso (só de quem tem a permissão, quando informada).
create or replace function public.whatsapp_destinos(p_empresa uuid, p_perm text default null)
returns table (telefone text)
language sql stable security definer set search_path = public as $$
  select v.telefone from whatsapp_vinculos v
  where v.empresa_id = p_empresa and v.confirmado_em is not null and v.avisos and app.empresa_liberada(p_empresa)
    and exists (select 1 from usuarios_empresa u where u.empresa_id = v.empresa_id and u.user_id = v.user_id and u.ativo)
    and (p_perm is null or app.usuario_pode(p_empresa, v.user_id, p_perm))
$$;

-- D4 automática ------------------------------------------------------------------------------------
alter table automacoes_empresa
  add column whatsapp_cobranca boolean not null default false,
  add column whatsapp_cobranca_hora time not null default '09:00';

create table whatsapp_cobrancas (
  agendamento_id uuid not null references agendamentos(id) on delete cascade,
  faixa text not null check (faixa in ('antes', 'hoje', 'atraso')),
  empresa_id uuid not null references empresas(id) on delete cascade,
  telefone text not null,
  enviado_em timestamptz not null default now(),
  primary key (agendamento_id, faixa)
);
create index on whatsapp_cobrancas (empresa_id, enviado_em desc);
alter table whatsapp_cobrancas enable row level security;
create policy membros on whatsapp_cobrancas for select using (empresa_id in (select app.minhas_empresas()));

-- Lembretes que já passaram da hora da empresa e ainda não saíram nesta fase. Fases: até 3 dias antes,
-- no dia e de 1 a 7 dias de atraso (depois disso, só pela régua na tela, à mão).
create or replace function public.cobrancas_whatsapp_devidas()
returns table (empresa_id uuid, agendamento_id uuid, faixa text, cliente text, telefone text, empresa text,
               saldo_cents bigint, vencimento date, segunda_via text)
language sql stable security definer set search_path = public as $$
  select a.empresa_id, a.id, f.faixa, c.nome, c.telefone, coalesce(nullif(e.nome_fantasia, ''), e.razao_social),
         (a.valor_cents - a.desconto_cents - a.pago_cents)::bigint, a.vencimento,
         (select cb.url_pdf from cobrancas cb where cb.agendamento_id = a.id and cb.url_pdf is not null
            and cb.status in ('emitida', 'visualizada', 'expirada') order by cb.created_at desc limit 1)
  from automacoes_empresa ae
  join empresas e on e.id = ae.empresa_id
  cross join lateral (select app.hoje(ae.empresa_id) as hoje) h
  join agendamentos a on a.empresa_id = ae.empresa_id and a.tipo = 'receber' and a.status in ('aberto', 'parcial')
    and a.vencimento between h.hoje - 7 and h.hoje + 3
  join contatos c on c.id = a.contato_id
  cross join lateral (select case when a.vencimento > h.hoje then 'antes' when a.vencimento = h.hoje then 'hoje' else 'atraso' end as faixa) f
  where ae.whatsapp_cobranca
    and (now() at time zone e.fuso)::time >= ae.whatsapp_cobranca_hora
    and app.empresa_liberada(ae.empresa_id) and app.plano_inclui(ae.empresa_id, 'contas-a-receber')
    and a.valor_cents - a.desconto_cents - a.pago_cents > 0
    and app.chave_celular(case when length(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) in (10, 11)
                               then '55' else '' end || regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) is not null
    and not exists (select 1 from whatsapp_cobrancas w where w.agendamento_id = a.id and w.faixa = f.faixa)
  order by a.empresa_id, a.vencimento
  limit 300
$$;

-- Marca o lembrete como enviado; false se já tinha saído (nunca repete a mesma fase).
create or replace function public.marcar_cobranca_whatsapp(p_agendamento uuid, p_faixa text, p_telefone text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into whatsapp_cobrancas (agendamento_id, faixa, empresa_id, telefone)
  select id, p_faixa, empresa_id, p_telefone from agendamentos where id = p_agendamento;
  return found;
exception when unique_violation then
  return false;
end $$;

-- Mensagens já tratadas: a Meta reenvia o webhook quando a resposta demora, e cada foto lida custa.
create table whatsapp_mensagens (
  id text primary key,
  recebida_em timestamptz not null default now()
);
alter table whatsapp_mensagens enable row level security; -- só o servidor (service_role) usa

-- C3/C4 pelo WhatsApp ------------------------------------------------------------------------------
alter table documentos_recebidos drop constraint if exists documentos_recebidos_origem_check;
alter table documentos_recebidos add constraint documentos_recebidos_origem_check check (origem in ('upload', 'email', 'whatsapp'));

revoke all on function public.whatsapp_pedir_codigo(uuid, text), public.whatsapp_avisos(uuid, boolean),
  public.whatsapp_confirmar(text, text), public.whatsapp_remetente(text), public.whatsapp_avisos_por_numero(text, boolean),
  public.whatsapp_destinos(uuid, text), public.cobrancas_whatsapp_devidas(), public.marcar_cobranca_whatsapp(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.whatsapp_pedir_codigo(uuid, text), public.whatsapp_avisos(uuid, boolean),
      public.whatsapp_confirmar(text, text), public.whatsapp_remetente(text), public.whatsapp_avisos_por_numero(text, boolean),
      public.whatsapp_destinos(uuid, text), public.cobrancas_whatsapp_devidas(), public.marcar_cobranca_whatsapp(uuid, text, text) from anon;
    grant execute on function public.whatsapp_pedir_codigo(uuid, text), public.whatsapp_avisos(uuid, boolean) to authenticated;
    grant execute on function public.whatsapp_confirmar(text, text), public.whatsapp_remetente(text), public.whatsapp_avisos_por_numero(text, boolean),
      public.whatsapp_destinos(uuid, text), public.cobrancas_whatsapp_devidas(), public.marcar_cobranca_whatsapp(uuid, text, text) to service_role;
  end if;
end $$;

select app.travar_referencias();
