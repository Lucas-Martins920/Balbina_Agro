-- Junta as duas versões de criar_empresa que entraram no mesmo dia:
-- a da NF-e (aceita CPF de produtor rural com IE, 4 argumentos) e a de permissões (grava o e-mail do master).
-- Em produção as duas ficaram como sobrecargas (3 e 4 argumentos), o que deixa a chamada ambígua.
-- Também: 20261026220000_permissoes_open_finance foi renomeada para 20261026225000, porque a versão
-- 20261026220000 já estava registrada pela NF-e e o script de migrations pulava a de permissões.

drop function if exists public.criar_empresa(text, text, text);

create or replace function public.criar_empresa(p_cnpj text, p_razao_social text, p_nome_fantasia text default null,
                                                p_inscricao_estadual text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_doc text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_ie text := nullif(regexp_replace(coalesce(p_inscricao_estadual, ''), '[^0-9A-Za-z]', '', 'g'), '');
begin
  if v_uid is null then
    raise exception 'Faça login para criar uma empresa' using errcode = 'insufficient_privilege';
  end if;
  if v_doc !~ '^(\d{11}|\d{14})$' then
    raise exception 'Informe o CNPJ (14 dígitos) ou o CPF do produtor rural (11 dígitos)' using errcode = 'check_violation';
  end if;
  if length(v_doc) = 11 and v_ie is null then
    raise exception 'Produtor rural com CPF precisa da inscrição estadual' using errcode = 'check_violation';
  end if;
  if exists (select 1 from empresas where cnpj = v_doc) then
    raise exception 'Já existe uma empresa com este documento' using errcode = 'unique_violation';
  end if;

  insert into empresas (cnpj, razao_social, nome_fantasia, inscricao_estadual, regime_tributario)
  values (v_doc, trim(p_razao_social), nullif(trim(p_nome_fantasia), ''), v_ie,
          case when length(v_doc) = 11 then 'produtor_rural' else 'simples' end)
  returning id into v_id;

  insert into usuarios_empresa (empresa_id, user_id, email, perfil, is_admin)
  values (v_id, v_uid, (select lower(email) from auth.users where id = v_uid), 'sem_restricao', true);

  perform app.carregar_padroes(v_id);
  return v_id;
end $$;

revoke all on function public.criar_empresa(text, text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.criar_empresa(text, text, text, text) from anon;
    grant execute on function public.criar_empresa(text, text, text, text) to authenticated;
  end if;
end $$;
