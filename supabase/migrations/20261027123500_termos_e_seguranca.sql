-- Aceite dos Termos de uso, da Política de privacidade e da Política de cookies (LGPD),
-- e travas contra troca dos identificadores que o servidor usa nas integrações.

-- ---------------------------------------------------------------------------
-- Aceite dos termos
-- ---------------------------------------------------------------------------

-- Um registro por pessoa e versão dos documentos. Ninguém altera nem apaga: é a prova do aceite.
create table aceites_termos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  versao text not null,
  origem text not null check (origem in ('cadastro', 'tela_aceite')),
  ip text,
  user_agent text,
  aceito_em timestamptz not null default now(),
  unique (user_id, versao)
);
alter table aceites_termos enable row level security;
create policy proprios on aceites_termos for select using (user_id = auth.uid());
revoke insert, update, delete on aceites_termos from anon, authenticated;

-- Grava o aceite da pessoa logada. IP e navegador vêm do servidor do app (informativos).
create or replace function aceitar_termos(p_versao text, p_origem text default 'tela_aceite', p_ip text default null, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para aceitar os termos' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_versao, '') !~ '^\d{4}-\d{2}-\d{2}(\.\d+)?$' then
    raise exception 'Versão dos termos inválida' using errcode = 'check_violation';
  end if;
  insert into aceites_termos (user_id, versao, origem, ip, user_agent)
  values (auth.uid(), p_versao, coalesce(p_origem, 'tela_aceite'), left(p_ip, 64), left(p_user_agent, 300))
  on conflict (user_id, versao) do nothing;
end $$;
revoke all on function aceitar_termos(text, text, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function aceitar_termos(text, text, text, text) from anon;
    grant execute on function aceitar_termos(text, text, text, text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Identificadores das integrações
-- ---------------------------------------------------------------------------
-- Asaas e Focus NFe usam uma credencial do servidor para todas as pisciculturas. Se o usuário pudesse
-- trocar o id do pagamento ou a referência da nota, o servidor agiria sobre o documento de outra
-- piscicultura (cancelar cobrança, consultar ou cancelar nota). Depois de gravados, só o service role troca
-- (limpar continua permitido, por exemplo ao desconectar um banco).

create or replace function app.protege_ids_integracao() returns trigger language plpgsql as $$
declare
  v_campo text := tg_argv[0];
  v_antes text := to_jsonb(old)->>v_campo;
  v_depois text := to_jsonb(new)->>v_campo;
begin
  if v_antes is not null and v_depois is not null and v_depois <> v_antes
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user in ('authenticated', 'anon') then
    raise exception 'O campo % é gravado pela integração e não pode ser alterado', v_campo using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger protege_id_externo before update of id_externo on cobrancas
for each row execute function app.protege_ids_integracao('id_externo');
create trigger protege_provedor_ref before update of provedor_ref on notas_fiscais
for each row execute function app.protege_ids_integracao('provedor_ref');
create trigger protege_asaas_cliente before update of asaas_cliente_id on contatos
for each row execute function app.protege_ids_integracao('asaas_cliente_id');
create trigger protege_item_open_finance before update of item_id on conexoes_bancarias
for each row execute function app.protege_ids_integracao('item_id');
create trigger protege_conta_open_finance before update of open_finance_conta_id on contas_financeiras
for each row execute function app.protege_ids_integracao('open_finance_conta_id');

-- A credencial do Asaas é escolhida pelo perfil da cobrança: o perfil tem de ser da mesma empresa,
-- senão uma piscicultura apontaria a sua cobrança para o perfil (e a chave) de outra.
create or replace function app.checa_perfil_da_cobranca() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis_cobranca p where p.id = new.perfil_cobranca_id and p.empresa_id = new.empresa_id) then
    raise exception 'O perfil de cobrança não é desta empresa' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger perfil_da_cobranca before insert or update of perfil_cobranca_id, empresa_id on cobrancas
for each row execute function app.checa_perfil_da_cobranca();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
  end if;
end $$;
