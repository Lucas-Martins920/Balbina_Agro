#!/usr/bin/env bash
# Roda as migrations e os testes de banco num Postgres limpo.
# Uso: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
# Os testes comparam current_date com app.hoje (fuso da empresa, padrão Manaus); com o banco em UTC eles
# falhavam entre 0h e 4h UTC, quando o dia já virou em UTC e ainda não em Manaus.
export PGOPTIONS='--client-min-messages=notice -c timezone=America/Manaus'
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?defina DATABASE_URL apontando para um Postgres 15+ descartável}"
DB_TESTE="erp_teste_$$"
psql "$DATABASE_URL" -qc "create database $DB_TESTE" >/dev/null
trap 'psql "$DATABASE_URL" -qc "drop database if exists $DB_TESTE" >/dev/null' EXIT
URL_TESTE=$(python3 -c "import sys,urllib.parse as u;p=u.urlparse(sys.argv[1]);print(p._replace(path='/'+sys.argv[2]).geturl())" "$DATABASE_URL" "$DB_TESTE")
psql "$URL_TESTE" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_prelude_postgres.sql
for f in supabase/migrations/*.sql; do psql "$URL_TESTE" -q -v ON_ERROR_STOP=1 -f "$f"; done
# Nos testes o 2º fator começa opcional (99_mfa.sql liga a exigência); em produção vale 'sim'.
psql "$URL_TESTE" -q -v ON_ERROR_STOP=1 -c "update app.parametros set valor = 'nao' where chave = 'exigir_2fa'"
# As tabelas, colunas e funções que o site e o app pedem ao banco existem depois das migrations
node scripts/conferir-consultas.mjs "$URL_TESTE"
for f in supabase/tests/[1-9]*.sql; do psql "$URL_TESTE" -X -q -A -t -o /dev/null -v ON_ERROR_STOP=1 -f "$f" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"; done
