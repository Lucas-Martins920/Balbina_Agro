-- F2 do estudo de automação (docs/estudo-automacao.html): coleta do relógio de ponto sem pendrive.
--
-- Cada empresa ganha um token (automacoes_empresa.ponto_token). Um agente na piscicultura (scripts/agente-ponto.mjs,
-- num computador da mesma rede do relógio) busca o AFD todo dia e manda para /api/entrada/ponto com o
-- token; o servidor chama importar_ponto_coletado(). Batida repetida é ignorada (índice único), então
-- mandar os mesmos dias de novo não duplica nada.
-- O corpo de importar_ponto passa para app.gravar_ponto, usado pela tela (com permissão) e pela coleta.

alter table automacoes_empresa
  add column ponto_token text unique check (ponto_token is null or ponto_token ~ '^[a-f0-9]{32}$'),
  add column ponto_ultima_coleta timestamptz;

create or replace function app.gravar_ponto(p_empresa uuid, p_arquivo jsonb, p_marcacoes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_total int;
  v_novas int;
  v_sem int;
begin
  if jsonb_typeof(p_marcacoes) <> 'array' or jsonb_array_length(p_marcacoes) = 0 then
    raise exception 'Nenhuma batida no arquivo' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_marcacoes) > 50000 then
    raise exception 'Arquivo grande demais: importe um mês por vez' using errcode = 'check_violation';
  end if;

  insert into ponto_importacoes (empresa_id, nome_arquivo, formato, documento, rep, periodo_inicio, periodo_fim)
  values (p_empresa, left(coalesce(nullif(trim(p_arquivo ->> 'nome'), ''), 'arquivo'), 200), p_arquivo ->> 'formato',
          nullif(p_arquivo ->> 'documento', ''), nullif(p_arquivo ->> 'rep', ''),
          (p_arquivo ->> 'inicio')::date, (p_arquivo ->> 'fim')::date)
  returning id into v_id;

  with lidas as (
    select nullif(m ->> 'cpf', '') as cpf, case when nullif(m ->> 'cpf', '') is null then nullif(m ->> 'pis', '') end as pis,
           (m ->> 'data')::date as data, (m ->> 'hora')::time(0) as hora, (m ->> 'nsr')::bigint as nsr
    from jsonb_array_elements(p_marcacoes) m
  ), novas as (
    insert into ponto_marcacoes (empresa_id, importacao_id, cpf, pis, data, hora, nsr, origem)
    select p_empresa, v_id, cpf, pis, data, hora, nsr, 'arquivo' from lidas
    on conflict (empresa_id, (coalesce(cpf, 'p' || pis)), data, hora) do nothing
    returning 1
  )
  select (select count(*) from lidas), (select count(*) from novas) into v_total, v_novas;

  update ponto_importacoes set total = v_total, novas = v_novas,
         periodo_inicio = coalesce(periodo_inicio, (select min(data) from ponto_marcacoes where importacao_id = v_id)),
         periodo_fim = coalesce(periodo_fim, (select max(data) from ponto_marcacoes where importacao_id = v_id))
   where id = v_id;

  select count(distinct coalesce(m.cpf, 'p' || m.pis)) into v_sem
  from ponto_marcacoes m
  where m.importacao_id = v_id
    and not exists (select 1 from funcionarios f where f.empresa_id = p_empresa and (f.cpf = m.cpf or f.pis = m.pis));

  if v_novas = 0 then delete from ponto_importacoes where id = v_id; v_id := null; end if;
  return jsonb_build_object('importacao_id', v_id, 'total', v_total, 'novas', v_novas, 'sem_funcionario', v_sem);
end $$;
revoke all on function app.gravar_ponto(uuid, jsonb, jsonb) from public;

create or replace function public.importar_ponto(p_empresa uuid, p_arquivo jsonb, p_marcacoes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.pode(p_empresa, 'rh.ponto') then
    raise exception 'Seu usuário não tem permissão para importar o ponto' using errcode = 'insufficient_privilege';
  end if;
  return app.gravar_ponto(p_empresa, p_arquivo, p_marcacoes);
end $$;

-- Servidor: AFD mandado pelo agente da piscicultura. Token desconhecido, empresa suspensa ou fora do plano: null.
create or replace function public.importar_ponto_coletado(p_token text, p_arquivo jsonb, p_marcacoes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from automacoes_empresa
  where ponto_token = p_token and p_token ~ '^[a-f0-9]{32}$';
  if v_empresa is null or not app.empresa_liberada(v_empresa) or not app.plano_inclui(v_empresa, 'rh') then return null; end if;
  update automacoes_empresa set ponto_ultima_coleta = now() where empresa_id = v_empresa;
  if jsonb_typeof(p_marcacoes) = 'array' and jsonb_array_length(p_marcacoes) = 0 then
    return jsonb_build_object('empresa_id', v_empresa, 'importacao_id', null, 'total', 0, 'novas', 0, 'sem_funcionario', 0);
  end if;
  return app.gravar_ponto(v_empresa, p_arquivo, p_marcacoes) || jsonb_build_object('empresa_id', v_empresa);
end $$;

revoke all on function public.importar_ponto_coletado(text, jsonb, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.importar_ponto_coletado(text, jsonb, jsonb) from anon, authenticated;
    grant execute on function public.importar_ponto_coletado(text, jsonb, jsonb) to service_role;
  end if;
end $$;

select app.travar_referencias();
