#!/usr/bin/env bash
# Faz backup e restauração de um banco com todas as migrations, para o CI pegar
# cedo uma migration que quebre a restauração.
# Uso: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres ./scripts/test-backup.sh
set -euo pipefail
export PGOPTIONS='--client-min-messages=warning'
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?defina DATABASE_URL apontando para um Postgres descartável}"
ORIGEM="bk_origem_$$"
DESTINO="bk_destino_$$"
SUPA="bk_supabase_$$"
TMP=$(mktemp -d)
url() { python3 -c "import sys,urllib.parse as u;p=u.urlparse(sys.argv[1]);print(p._replace(path='/'+sys.argv[2]).geturl())" "$DATABASE_URL" "$1"; }
limpa() {
  psql "$DATABASE_URL" -qc "drop database if exists $ORIGEM" -c "drop database if exists $DESTINO" \
    -c "drop database if exists $SUPA" >/dev/null
  rm -rf "$TMP"
}
trap limpa EXIT
psql "$DATABASE_URL" -qc "create database $ORIGEM" -c "create database $DESTINO" -c "create database $SUPA" >/dev/null
psql "$(url $ORIGEM)" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_prelude_postgres.sql
for f in supabase/migrations/*.sql; do psql "$(url $ORIGEM)" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
# Alguns dados, para a contagem ter o que conferir
for f in supabase/tests/[1-9]*.sql; do psql "$(url $ORIGEM)" -X -q -o /dev/null -f "$f" >/dev/null 2>&1 || true; done
# Linha que aponta para auth.users: a restauração precisa trazer os logins antes do app
psql "$(url $ORIGEM)" -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000b4c1', 'backup@teste.local')
  on conflict do nothing;
insert into public.sessoes_2fa (session_id, user_id, metodo)
  values (gen_random_uuid(), '00000000-0000-4000-8000-00000000b4c1', 'app');
SQL

export BACKUP_SENHA=teste
# O banco de exemplo não tem empresa de verdade: a conferência mínima olha a linha criada acima
export EXIGIR_LINHAS=public.sessoes_2fa
arquivo=$(DATABASE_URL=$(url $ORIGEM) ./scripts/backup-banco.sh "$TMP")
DATABASE_URL=$(url $DESTINO) ./scripts/restaurar-backup.sh "$arquivo" --teste

# Projeto Supabase novo (aqui, o esboço do auth já criado): o ensaio confere e desfaz tudo,
# e a restauração de verdade traz os logins antes do app
psql "$(url $SUPA)" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_prelude_postgres.sql
DATABASE_URL=$(url $SUPA) ./scripts/restaurar-backup.sh "$arquivo" --ensaio
if [ "$(psql "$(url $SUPA)" -tAc "select count(*) from pg_tables where schemaname = 'public'")" != "0" ] ||
  [ "$(psql "$(url $SUPA)" -tAc "select count(*) from auth.users")" != "0" ]; then
  echo "O ensaio deixou dados no destino" >&2
  exit 1
fi
DATABASE_URL=$(url $SUPA) ./scripts/restaurar-backup.sh "$arquivo"
