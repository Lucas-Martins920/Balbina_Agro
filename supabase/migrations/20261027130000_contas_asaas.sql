-- Conta Asaas de cada piscicultura. Até aqui todas as cobranças usavam a mesma chave (ASAAS_API_KEY),
-- o que num SaaS juntaria o dinheiro de todas as pisciculturas numa conta só. Agora cada perfil de cobrança
-- tem a sua conta: uma subconta aberta pelo Balbina ou a conta Asaas que a piscicultura já tinha.
-- A chave da API fica cifrada pelo servidor (BALBINA_CHAVE_CRIPTO) numa tabela que só o service role lê.

create table contas_asaas (
  perfil_cobranca_id uuid primary key references perfis_cobranca(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  modo text not null check (modo in ('subconta', 'propria')),
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  conta_id text,
  wallet_id text,
  email text,
  -- situação cadastral geral no Asaas (GET /myAccount/status): só APPROVED emite cobranças de verdade
  situacao text not null default 'PENDING' check (situacao in ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contas_asaas_segredos (
  perfil_cobranca_id uuid primary key references contas_asaas(perfil_cobranca_id) on delete cascade,
  chave_cifrada text not null,
  webhook_token_sha256 text not null
);

-- Membros veem a situação da conta; quem grava é o servidor depois de falar com o Asaas.
alter table contas_asaas enable row level security;
create policy membros on contas_asaas for select using (empresa_id in (select app.minhas_empresas()));
revoke insert, update, delete on contas_asaas from anon, authenticated;

-- Segredos: sem policy e sem privilégio, nem leitura pela API pública.
alter table contas_asaas_segredos enable row level security;
revoke all on contas_asaas_segredos from anon, authenticated;

-- credenciais_ref escolhe a variável de ambiente com a chave do Asaas. Se um usuário pudesse mudá-la,
-- apontaria a cobrança da piscicultura dele para a chave do servidor. Só o servidor (service role) mexe nela.
create or replace function app.protege_credenciais() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and new.credenciais_ref is not null)
    or (tg_op = 'UPDATE' and new.credenciais_ref is distinct from old.credenciais_ref)) then
    raise exception 'A credencial do Asaas é definida pelo servidor' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger protege_credenciais before insert or update on perfis_cobranca
for each row execute function app.protege_credenciais();
