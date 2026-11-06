-- Automações de rotina (H3, E1 e F1 do estudo docs/estudo-automacao.html).
--
-- H3 resumo diário: todo dia, na hora escolhida, aviso no celular de quem vê relatórios com a produção
--    de ontem, as contas do dia e os alertas.
-- E1 pacote do contador: no dia escolhido do mês, aviso de que o pacote do mês anterior está pronto
--    (o arquivo é montado na hora do download em /relatorios/contador, com a permissão de quem baixa).
-- F1 fechamento do ponto: no dia escolhido, a rotina apura o ponto do mês anterior e avisa o RH do
--    que falta acertar, com o link da planilha da contadora.
-- Os avisos usam lembretes_enviados para sair uma vez por dia (resumo) ou por mês (pacote e ponto).

alter table automacoes_empresa
  add column resumo_diario boolean not null default false,
  add column resumo_hora time not null default '06:30',
  add column pacote_contador boolean not null default false,
  add column pacote_contador_dia smallint not null default 5 check (pacote_contador_dia between 1 and 28),
  add column fechamento_ponto boolean not null default false,
  add column fechamento_ponto_dia smallint not null default 1 check (fechamento_ponto_dia between 1 and 28);

-- Igual a app.pode, mas para outro usuário e sem a checagem de MFA da sessão (serve para escolher quem
-- recebe um aviso, nunca para liberar dados).
create or replace function app.usuario_pode(p_empresa uuid, p_user uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app.empresa_liberada(p_empresa) and app.plano_inclui(p_empresa, split_part(p_perm, '.', 1)) and exists (
    select 1 from usuarios_empresa u
    where u.empresa_id = p_empresa and u.user_id = p_user and u.ativo
      and (u.is_admin or u.perfil = 'sem_restricao' or exists (
        select 1 from unnest(app.chaves_membro(u.perfil, u.cargo_id, u.permissoes)) c
        where c = p_perm
           or (p_perm like '%.ver' and (c = '*.ver' or split_part(c, '.', 1) = split_part(p_perm, '.', 1)))))
  )
$$;
revoke all on function app.usuario_pode(uuid, uuid, text) from public;

-- Celulares que podem receber um aviso que exige a permissão (só o servidor chama).
create or replace function public.inscricoes_com_permissao(p_empresa uuid, p_perm text)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select i.id, i.endpoint, i.p256dh, i.auth from push_inscricoes i
  where i.empresa_id = p_empresa and app.usuario_pode(p_empresa, i.user_id, p_perm)
$$;

-- Marca o aviso como enviado; devolve false se já tinha saído (para nunca repetir).
create or replace function app.marcar_aviso(p_empresa uuid, p_tipo text, p_data date) returns boolean
language plpgsql set search_path = public as $$
begin
  insert into lembretes_enviados (empresa_id, tipo, data) values (p_empresa, p_tipo, p_data);
  return true;
exception when unique_violation then
  return false;
end $$;
revoke all on function app.marcar_aviso(uuid, text, date) from public;

-- H3: resumos que já passaram da hora e não saíram hoje.
create or replace function public.resumos_diarios_devidos()
returns table (empresa_id uuid, dia date, resumo jsonb)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_hoje date;
  v_ontem date;
begin
  for r in select a.empresa_id, a.resumo_hora, e.fuso from automacoes_empresa a join empresas e on e.id = a.empresa_id
           where a.resumo_diario and app.empresa_liberada(a.empresa_id) loop
    v_hoje := (now() at time zone r.fuso)::date;
    continue when (now() at time zone r.fuso)::time < r.resumo_hora;
    continue when not app.marcar_aviso(r.empresa_id, 'resumo', v_hoje);
    v_ontem := v_hoje - 1;
    empresa_id := r.empresa_id;
    dia := v_hoje;
    select jsonb_build_object(
      'ovos', coalesce(sum(d.ovos_total), 0),
      'peixes', coalesce(sum(d.peixes_inicio_dia), 0),
      'mortes', coalesce(sum(d.mortes + d.descartes), 0),
      'sem_lancamento', (select count(*) from alocacoes_atuais x where x.empresa_id = r.empresa_id
                          and not exists (select 1 from apontamentos_diarios y where y.empresa_id = r.empresa_id
                                          and y.viveiro_id = x.viveiro_id and y.data = v_ontem)),
      'pagar_hoje', (select jsonb_build_object('n', count(*), 'cents', coalesce(sum(t.valor_cents - t.desconto_cents - t.pago_cents), 0))
                     from agendamentos t where t.empresa_id = r.empresa_id and t.tipo = 'pagar'
                       and t.status in ('aberto', 'parcial') and t.vencimento = v_hoje),
      'pagar_vencidas', (select count(*) from agendamentos t where t.empresa_id = r.empresa_id and t.tipo = 'pagar'
                         and t.status in ('aberto', 'parcial') and t.vencimento < v_hoje),
      'receber_hoje', (select jsonb_build_object('n', count(*), 'cents', coalesce(sum(t.valor_cents - t.desconto_cents - t.pago_cents), 0))
                       from agendamentos t where t.empresa_id = r.empresa_id and t.tipo = 'receber'
                         and t.status in ('aberto', 'parcial') and t.vencimento = v_hoje),
      'alertas_criticos', (select count(*) from alertas x where x.empresa_id = r.empresa_id and x.nivel = 'critico'))
    into resumo
    from apontamentos_diarios d where d.empresa_id = r.empresa_id and d.data = v_ontem;
    return next;
  end loop;
end $$;

-- E1 e F1: avisos mensais do mês anterior, a partir do dia escolhido. Um por empresa, tipo e mês.
create or replace function public.avisos_mensais_devidos()
returns table (empresa_id uuid, tipo text, mes text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_hoje date;
  v_mes date;
begin
  for r in select a.*, e.fuso from automacoes_empresa a join empresas e on e.id = a.empresa_id
           where (a.pacote_contador or a.fechamento_ponto) and app.empresa_liberada(a.empresa_id) loop
    v_hoje := (now() at time zone r.fuso)::date;
    v_mes := (date_trunc('month', v_hoje) - interval '1 month')::date;
    if r.pacote_contador and extract(day from v_hoje) >= r.pacote_contador_dia
       and app.marcar_aviso(r.empresa_id, 'pacote_contador', v_mes) then
      empresa_id := r.empresa_id; tipo := 'pacote_contador'; mes := to_char(v_mes, 'YYYY-MM');
      return next;
    end if;
    if r.fechamento_ponto and extract(day from v_hoje) >= r.fechamento_ponto_dia
       and app.plano_inclui(r.empresa_id, 'rh')
       and app.marcar_aviso(r.empresa_id, 'fechamento_ponto', v_mes) then
      empresa_id := r.empresa_id; tipo := 'fechamento_ponto'; mes := to_char(v_mes, 'YYYY-MM');
      return next;
    end if;
  end loop;
end $$;

revoke all on function public.inscricoes_com_permissao(uuid, text), public.resumos_diarios_devidos(),
  public.avisos_mensais_devidos() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.inscricoes_com_permissao(uuid, text), public.resumos_diarios_devidos(),
      public.avisos_mensais_devidos() from anon, authenticated;
    grant execute on function public.inscricoes_com_permissao(uuid, text), public.resumos_diarios_devidos(),
      public.avisos_mensais_devidos() to service_role;
  end if;
end $$;

select app.travar_referencias();
