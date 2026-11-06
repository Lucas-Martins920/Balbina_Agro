-- F3 do estudo de automação (docs/estudo-automacao.html): ponto pelo celular com a localização da piscicultura.
--
-- O funcionário com usuário no Balbina bate o ponto no app de campo; o servidor confere se ele está dentro do
-- raio da piscicultura (automacoes_empresa.ponto_lat/lng/raio) e grava em ponto_marcacoes com origem 'celular',
-- na hora do servidor (não a do aparelho). Entra na mesma apuração das batidas do relógio.
-- É registro gerencial: não é REP-P (Portaria 671 exige programa registrado no INPI); o espelho oficial
-- continua saindo do sistema de ponto certificado (docs/rh.md).

alter table automacoes_empresa
  add column ponto_celular boolean not null default false,
  add column ponto_lat numeric(9, 6) check (ponto_lat between -90 and 90),
  add column ponto_lng numeric(9, 6) check (ponto_lng between -180 and 180),
  add column ponto_raio_m int not null default 300 check (ponto_raio_m between 50 and 5000);

alter table ponto_marcacoes
  add column lat numeric(9, 6),
  add column lng numeric(9, 6),
  add column distancia_m int;
alter table ponto_marcacoes drop constraint if exists ponto_marcacoes_origem_check;
alter table ponto_marcacoes add constraint ponto_marcacoes_origem_check check (origem in ('arquivo', 'manual', 'celular'));
alter table ponto_marcacoes drop constraint manual_justificada;
alter table ponto_marcacoes add constraint manual_justificada check (origem <> 'manual' or length(trim(coalesce(justificativa, ''))) >= 3);
alter table ponto_marcacoes drop constraint arquivo_com_importacao;
alter table ponto_marcacoes add constraint arquivo_com_importacao check (origem <> 'arquivo' or importacao_id is not null);
alter table ponto_marcacoes add constraint celular_com_local check (origem <> 'celular' or (lat is not null and lng is not null));

-- Batida do relógio ou do celular não se apaga nem muda (só desconsiderar com motivo).
create or replace function app.marcacao_proteger() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.origem in ('arquivo', 'celular') and pg_trigger_depth() < 2 then
      raise exception 'Batida do relógio ou do celular não se apaga: marque como desconsiderada, com o motivo, ou apague a importação inteira'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if (new.cpf, new.pis, new.data, new.hora, new.origem, new.nsr, new.importacao_id, new.empresa_id, new.lat, new.lng)
     is distinct from (old.cpf, old.pis, old.data, old.hora, old.origem, old.nsr, old.importacao_id, old.empresa_id, old.lat, old.lng) then
    raise exception 'Data e hora da batida não mudam: lance uma batida manual com justificativa e desconsidere a errada'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- Distância em metros entre dois pontos (fórmula de haversine).
create or replace function app.distancia_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns int
language sql immutable set search_path = public as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::int
$$;

-- Funcionário ligado ao usuário logado (ativo hoje).
create or replace function app.meu_funcionario(p_empresa uuid) returns funcionarios
language sql stable security definer set search_path = public as $$
  select f.* from funcionarios f
  where f.empresa_id = p_empresa and f.user_id = auth.uid() and (f.demissao is null or f.demissao >= app.hoje(p_empresa))
  limit 1
$$;
revoke all on function app.meu_funcionario(uuid) from public;

create or replace function public.bater_ponto_celular(p_empresa uuid, p_lat numeric, p_lng numeric, p_precisao numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg automacoes_empresa;
  f funcionarios;
  v_dist int;
  v_folga int := least(greatest(coalesce(p_precisao, 0), 0), 100)::int;
  v_data date;
  v_hora time(0);
begin
  if auth.uid() is null or p_empresa not in (select app.minhas_empresas()) then
    raise exception 'Empresa não encontrada' using errcode = 'insufficient_privilege';
  end if;
  if not app.empresa_liberada(p_empresa) or not app.plano_inclui(p_empresa, 'rh') then
    raise exception 'O ponto pelo celular não faz parte do plano da empresa' using errcode = 'insufficient_privilege';
  end if;
  select * into cfg from automacoes_empresa where empresa_id = p_empresa;
  if not coalesce(cfg.ponto_celular, false) or cfg.ponto_lat is null or cfg.ponto_lng is null then
    raise exception 'O ponto pelo celular não está ligado nesta empresa' using errcode = 'check_violation';
  end if;
  f := app.meu_funcionario(p_empresa);
  if f.id is null then
    raise exception 'Seu usuário não está ligado a um funcionário do RH. Peça ao responsável.' using errcode = 'check_violation';
  end if;
  if f.cpf is null and f.pis is null then
    raise exception 'Seu cadastro de funcionário está sem CPF. Peça ao responsável.' using errcode = 'check_violation';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Localização inválida' using errcode = 'check_violation';
  end if;
  if coalesce(p_precisao, 0) > 500 then
    raise exception 'Localização imprecisa (% m). Ligue o GPS e tente ao ar livre.', round(p_precisao) using errcode = 'check_violation';
  end if;
  v_dist := app.distancia_m(cfg.ponto_lat, cfg.ponto_lng, p_lat, p_lng);
  if v_dist > cfg.ponto_raio_m + v_folga then
    raise exception 'Você está a % m da piscicultura; o ponto pelo celular vale até % m.', v_dist, cfg.ponto_raio_m using errcode = 'check_violation';
  end if;

  v_data := app.hoje(p_empresa);
  v_hora := (now() at time zone (select fuso from empresas where id = p_empresa))::time(0);
  if exists (select 1 from ponto_marcacoes m
             where m.empresa_id = p_empresa and coalesce(m.cpf, 'p' || m.pis) = coalesce(f.cpf, 'p' || f.pis) and m.data = v_data
               and not m.desconsiderada and abs(extract(epoch from (m.hora - v_hora))) < 120) then
    raise exception 'Batida já registrada há menos de 2 minutos' using errcode = 'check_violation';
  end if;
  insert into ponto_marcacoes (empresa_id, cpf, pis, data, hora, origem, lat, lng, distancia_m)
  values (p_empresa, f.cpf, case when f.cpf is null then f.pis end, v_data, v_hora, 'celular', round(p_lat, 6), round(p_lng, 6), v_dist);
  return jsonb_build_object('data', v_data, 'hora', to_char(v_hora, 'HH24:MI'), 'distancia_m', v_dist);
end $$;

-- As batidas de hoje do próprio funcionário (o tratador não vê o RH).
create or replace function public.meu_ponto_hoje(p_empresa uuid)
returns table (hora text, origem text)
language sql stable security definer set search_path = public as $$
  select to_char(m.hora, 'HH24:MI'), m.origem from ponto_marcacoes m, app.meu_funcionario(p_empresa) f
  where f.id is not null and m.empresa_id = p_empresa and m.data = app.hoje(p_empresa) and not m.desconsiderada
    and coalesce(m.cpf, 'p' || m.pis) = coalesce(f.cpf, 'p' || f.pis)
  order by m.hora
$$;

-- O app de campo só mostra o botão para quem pode bater: ligado na empresa e usuário com funcionário.
create or replace function public.posso_bater_ponto(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ponto_celular and ponto_lat is not null from automacoes_empresa where empresa_id = p_empresa), false)
    and app.plano_inclui(p_empresa, 'rh') and (app.meu_funcionario(p_empresa)).id is not null
$$;

revoke all on function public.bater_ponto_celular(uuid, numeric, numeric, numeric), public.meu_ponto_hoje(uuid), public.posso_bater_ponto(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.bater_ponto_celular(uuid, numeric, numeric, numeric), public.meu_ponto_hoje(uuid), public.posso_bater_ponto(uuid) from anon;
    grant execute on function public.bater_ponto_celular(uuid, numeric, numeric, numeric), public.meu_ponto_hoje(uuid), public.posso_bater_ponto(uuid) to authenticated;
  end if;
end $$;

select app.travar_referencias();
