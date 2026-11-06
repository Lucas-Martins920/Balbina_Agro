#!/usr/bin/env bash
# Gera um backup cifrado do banco do Balbina.
# Uso: DATABASE_URL=postgresql://... BACKUP_SENHA=... ./scripts/backup-banco.sh <pasta-de-saida>
# Sai <pasta>/balbina-AAAAMMDD-HHMM.tar.gpg com:
#   app.dump    schemas do Balbina (public, app, balbina_meta e os que vierem), estrutura + dados
#   auth.dump   só os dados de login do Supabase (usuários, identidades, fatores de MFA)
#   auth-usuarios.csv  id e e-mail dos usuários, para a restauração de teste
#   extensoes.txt  extensões do banco e o schema de cada (o pg_dump por schema não as leva)
#   cron-jobs.csv  rotinas do pg_cron (o schema cron fica de fora do app.dump)
#   contagens.tsv  linhas por tabela no momento do backup
#   manifesto.txt  data, versão do servidor e sha256 dos dumps
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL com a connection string do banco}"
: "${BACKUP_SENHA:?defina BACKUP_SENHA (senha que cifra o arquivo)}"
SAIDA=${1:?informe a pasta de saída}
mkdir -p "$SAIDA"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
NOME="balbina-$(date -u +%Y%m%d-%H%M)"
mkdir "$TMP/$NOME"
D="$TMP/$NOME"
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

# Tudo menos os schemas que o próprio Supabase cria e mantém
SISTEMA="auth storage extensions graphql graphql_public realtime _realtime _analytics supabase_functions
supabase_migrations vault pgsodium pgsodium_masks net cron pgbouncer pgtle information_schema"
excluir=()
for s in $SISTEMA; do excluir+=(-N "$s"); done
pg_dump "$DATABASE_URL" -Fc -Z 6 "${excluir[@]}" -N 'pg_*' -f "$D/app.dump"

# Tabelas do auth que existirem (no Postgres dos testes só há um esboço delas)
tabelas_auth=()
for t in users identities mfa_factors; do
  if [ "$("${PSQL[@]}" -tAc "select to_regclass('auth.$t') is not null")" = "t" ]; then
    tabelas_auth+=(-t "auth.$t")
  fi
done
if [ ${#tabelas_auth[@]} -gt 0 ]; then
  pg_dump "$DATABASE_URL" -Fc -Z 6 --data-only "${tabelas_auth[@]}" -f "$D/auth.dump"
  # Só id e e-mail, para a restauração de teste (Postgres puro, sem o auth completo)
  # satisfazer as chaves estrangeiras que apontam para auth.users
  "${PSQL[@]}" -c "\copy (select id, email, email_confirmed_at from auth.users order by id) to '$D/auth-usuarios.csv' csv"
fi

"${PSQL[@]}" -tA -F $'\t' -c "select extname, extnamespace::regnamespace from pg_extension where extname <> 'plpgsql' order by 1" > "$D/extensoes.txt"

# Rotinas agendadas no pg_cron (webhooks, automações, recorrências): voltam junto na restauração
if [ "$("${PSQL[@]}" -tAc "select to_regclass('cron.job') is not null and has_table_privilege('cron.job', 'select')")" = "t" ]; then
  "${PSQL[@]}" -c "\copy (select jobname, schedule, command, active from cron.job where jobname is not null order by jobid) to '$D/cron-jobs.csv' csv"
fi

# Contagem exata por tabela, para comparar depois da restauração
"${PSQL[@]}" -tA -F $'\t' -v sistema="$SISTEMA" > "$D/contagens.tsv" <<'SQL'
select format('select %L, count(*) from %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname <> all (regexp_split_to_array(:'sistema', '\s+'))
  and n.nspname not like 'pg\_%'
order by 1
\gexec
SQL

{
  echo "gerado_em: $(date -u +%FT%TZ)"
  echo "servidor: $("${PSQL[@]}" -tAc 'show server_version')"
  echo "pg_dump: $(pg_dump --version)"
  (cd "$D" && sha256sum ./*.dump ./*.csv 2>/dev/null)
} > "$D/manifesto.txt"

tar -C "$TMP" -cf - "$NOME" |
  gpg --batch --yes --quiet --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 -o "$SAIDA/$NOME.tar.gpg" 3<<<"$BACKUP_SENHA"

echo "$SAIDA/$NOME.tar.gpg"
