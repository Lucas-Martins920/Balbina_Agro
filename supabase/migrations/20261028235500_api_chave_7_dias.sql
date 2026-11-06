-- Regra do Nicolas (2026-10-28): só o master gera chave de API e toda chave vale 7 dias.
--
-- 1. A validade é do banco, não da tela: criar_chave_api grava sempre now() + 7 dias e a constraint
--    impede chave sem vencimento ou com prazo maior (nem um update direto com a chave de serviço passa).
-- 2. Chaves que já existiam passam a vencer 7 dias depois de criadas.
-- 3. Quem deixa de ser master (perde o papel, é bloqueado ou sai da empresa) tem as chaves que criou
--    revogadas na hora: a chave não sobrevive à pessoa que a autorizou.

update api_chaves set expira_em = criada_em + interval '7 days'
where expira_em is null or expira_em > criada_em + interval '7 days';

alter table api_chaves
  add constraint api_chaves_validade_7_dias check (expira_em is not null and expira_em <= criada_em + interval '7 days'),
  add constraint api_chaves_prefixo_curto check (length(prefixo) <= 20);

drop function public.criar_chave_api(uuid, text, text[], text, text, timestamptz);

create or replace function public.criar_chave_api(p_empresa uuid, p_nome text, p_escopos text[], p_hash text, p_prefixo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform app.exige_master(p_empresa);
  if (select count(*) from api_chaves where empresa_id = p_empresa and revogada_em is null and expira_em > now()) >= 20 then
    raise exception 'Limite de 20 chaves ativas. Revogue as que não usa mais' using errcode = 'check_violation';
  end if;
  insert into api_chaves (empresa_id, nome, prefixo, hash_sha256, escopos, criada_por, criada_em, expira_em)
  values (p_empresa, trim(p_nome), p_prefixo, p_hash, (select array_agg(distinct e order by e) from unnest(p_escopos) e),
          auth.uid(), now(), now() + interval '7 days')
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.criar_chave_api(uuid, text, text[], text, text), public.revogar_chave_api(uuid),
  public.criar_webhook_api(uuid, text, text[], text), public.alterar_webhook_api(uuid, boolean, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.criar_chave_api(uuid, text, text[], text, text), public.revogar_chave_api(uuid),
      public.criar_webhook_api(uuid, text, text[], text), public.alterar_webhook_api(uuid, boolean, boolean) from anon;
    grant execute on function public.criar_chave_api(uuid, text, text[], text, text) to authenticated;
  end if;
end $$;

create or replace function app.revoga_chaves_de_ex_master() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or not (new.is_admin and new.ativo) then
    update api_chaves set revogada_em = now(), revogada_por = auth.uid()
    where empresa_id = old.empresa_id and criada_por = old.user_id and revogada_em is null;
  end if;
  return null;
end $$;

create trigger revoga_chaves_api after update of is_admin, ativo or delete on usuarios_empresa
  for each row when (old.is_admin) execute function app.revoga_chaves_de_ex_master();
