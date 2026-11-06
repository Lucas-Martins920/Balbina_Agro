#!/usr/bin/env bash
# Restaura um backup gerado por backup-banco.sh.
# Uso: DATABASE_URL=postgresql://... BACKUP_SENHA=... ./scripts/restaurar-backup.sh <arquivo.tar.gpg> [--teste|--ensaio]
#
# --teste:  banco Postgres puro e vazio (CI). Cria o esboço do Supabase (auth, papéis),
#           restaura app.dump com id e e-mail dos usuários e confere as contagens de linhas.
# --ensaio: banco de um projeto Supabase novo e vazio. Faz a restauração completa e confere
#           as contagens, mas desfaz tudo no fim: o destino continua vazio.
# Sem opção: banco de um projeto Supabase novo e vazio. Restaura os dados de login (auth.dump)
#           e o app.dump, e agenda de novo as rotinas do pg_cron. Leia docs/backup.md antes.
#
# O destino precisa ter as extensões da produção (pg_cron, pg_net...): se faltar uma, falha.
# Falha também se as tabelas principais (EXIGIR_LINHAS) vierem vazias no backup.
#
# Tudo roda numa transação só: se qualquer passo ou contagem falhar, nada fica gravado.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?defina DATABASE_URL com a connection string do banco de destino}"
: "${BACKUP_SENHA:?defina BACKUP_SENHA}"
ARQUIVO=${1:?informe o arquivo .tar.gpg}
MODO=${2:-}
case "$MODO" in "" | --teste | --ensaio) ;; *) echo "Opção desconhecida: $MODO" >&2; exit 1 ;; esac
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
gpg --batch --quiet --decrypt --passphrase-fd 3 "$ARQUIVO" 3<<<"$BACKUP_SENHA" | tar -C "$TMP" -xf -
D=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d)
(cd "$D" && grep -E '\.(dump|csv)$' manifesto.txt | sha256sum -c --quiet)

if [ "$MODO" = "--teste" ]; then
  "${PSQL[@]}" -f supabase/tests/00_prelude_postgres.sql
fi

# --clean não: o destino precisa estar vazio, para não apagar nada por engano
if [ "$("${PSQL[@]}" -tAc "select count(*) from pg_tables where schemaname = 'public'")" != "0" ]; then
  echo "O schema public do destino já tem tabelas. Use um banco vazio." >&2
  exit 1
fi
if [ "$MODO" != "--teste" ] && [ "$("${PSQL[@]}" -tAc "select count(*) from auth.users")" != "0" ]; then
  echo "O destino já tem usuários em auth.users. Use um projeto Supabase novo e vazio." >&2
  exit 1
fi

# Monta um script só. Os logins entram antes do app: tabelas como sessoes_2fa têm chave
# estrangeira para auth.users, e o app.dump cria essas chaves no fim, conferindo as linhas.
SQL="$TMP/restaurar.sql"
{
  echo '\o /dev/null'
  # mostra o comando que falhou junto do erro
  echo '\set ECHO errors'
  echo 'begin;'
  # Cada extensão no schema em que estava (backups antigos só têm o nome). Extensão que o destino
  # não tem faz a restauração falhar aqui: o destino precisa ser igual à produção (pg_cron, pg_net...).
  while IFS=$'\t' read -r ext esquema; do
    [ -n "$ext" ] || continue
    if [ -z "$esquema" ] || [ "$esquema" = "pg_catalog" ]; then
      echo "create extension if not exists \"$ext\";"
    else
      echo "create schema if not exists \"$esquema\";"
      echo "create extension if not exists \"$ext\" schema \"$esquema\";"
    fi
  done < "$D/extensoes.txt"
  if [ "$MODO" = "--teste" ]; then
    [ -f "$D/auth-usuarios.csv" ] &&
      echo "\\copy auth.users (id, email, email_confirmed_at) from '$D/auth-usuarios.csv' csv"
  elif [ -f "$D/auth.dump" ]; then
    pg_restore --data-only --no-owner -f - "$D/auth.dump"
  fi
  # O schema public já existe em qualquer banco novo, e gatilhos de evento e publicações
  # são do próprio Supabase (o projeto novo já os tem); o resto vai como está no dump
  pg_restore -l "$D/app.dump" | grep -v -e ' SCHEMA - public ' -e ' EVENT TRIGGER ' -e ' PUBLICATION ' > "$TMP/lista"
  # Permissões do próprio Supabase não se copiam entre projetos: o projeto novo já as tem, e o Postgres
  # recusa dar ao postgres o que veio dele ("grant options cannot be granted back to your own grantor")
  # e mexer nos privilégios padrão do supabase_admin ("permission denied to change default privileges")
  pg_restore --no-owner -L "$TMP/lista" -f - "$D/app.dump" |
    sed -E -e '/^GRANT .* TO "?postgres"?( WITH GRANT OPTION)?;$/d' \
      -e '/^ALTER DEFAULT PRIVILEGES FOR ROLE "?supabase_[a-z_]+"? /d'
  # Rotinas do pg_cron (fora do --teste, que é Postgres puro): agenda de novo com o mesmo nome
  if [ "$MODO" != "--teste" ] && [ -f "$D/cron-jobs.csv" ]; then
    echo 'create temp table _cron_jobs (jobname text, schedule text, command text, active boolean);'
    echo "\\copy _cron_jobs from '$D/cron-jobs.csv' csv"
    echo 'select cron.schedule(jobname, schedule, command) from _cron_jobs;'
    echo 'select cron.alter_job(j.jobid, active := false) from cron.job j join _cron_jobs c using (jobname) where not c.active;'
    echo "do \$\$ begin if (select count(*) from cron.job j join _cron_jobs c using (jobname)) <> (select count(*) from _cron_jobs) then raise exception 'rotinas do pg_cron não voltaram todas'; end if; end \$\$;"
    echo "\\o $TMP/cron.txt"
    echo 'select count(*) from _cron_jobs;'
    echo '\o /dev/null'
  fi
  # Um backup vazio "restaura" sem diferença nenhuma: as tabelas principais precisam ter linhas
  # (EXIGIR_LINHAS troca a lista; o teste do CI, com banco de exemplo, passa a dele)
  for t in ${EXIGIR_LINHAS-public.empresas public.usuarios_empresa balbina_meta.migracoes}; do
    if awk -F'\t' -v t="$t" '$1 == t && $2 > 0 {ok = 1} END {exit !ok}' "$D/contagens.tsv"; then :; else
      echo "do \$\$ begin raise exception 'backup sem linhas em $t'; end \$\$;"
    fi
  done
  # Contagens dentro da mesma transação (no ensaio, antes de desfazer)
  echo "\\o $TMP/obtido.tsv"
  while IFS=$'\t' read -r tabela _; do
    [ -n "$tabela" ] && echo "select '$tabela', count(*) from $tabela;"
  done < "$D/contagens.tsv"
  echo '\o /dev/null'
  # Contagem diferente aborta a transação: nada fica gravado pela metade
  while IFS=$'\t' read -r tabela esperado; do
    [ -n "$tabela" ] && echo "do \$\$ begin if (select count(*) from $tabela) <> $esperado then raise exception 'contagem diferente em $tabela'; end if; end \$\$;"
  done < "$D/contagens.tsv"
  if [ "$MODO" = "--ensaio" ]; then echo 'rollback;'; else echo 'commit;'; fi
} > "$SQL"
erro=0
"${PSQL[@]}" -tA -F $'\t' -f "$SQL" 2>"$TMP/erros.log" || erro=1
cat "$TMP/erros.log" >&2
grep -q 'ERROR:' "$TMP/erros.log" && erro=1
touch "$TMP/obtido.tsv"

# Confere as contagens de linhas
falhas=0
while IFS=$'\t' read -r tabela esperado; do
  [ -n "$tabela" ] || continue
  obtido=$(awk -F'\t' -v t="$tabela" '$1 == t {print $2}' "$TMP/obtido.tsv")
  if [ "$obtido" != "$esperado" ]; then
    echo "DIFERENTE: $tabela backup=$esperado restaurado=${obtido:-?}" >&2
    falhas=$((falhas + 1))
  fi
done < "$D/contagens.tsv"

total=$(wc -l < "$D/contagens.tsv")
linhas=$(awk -F'\t' '{s += $2} END {print s + 0}' "$D/contagens.tsv")
if [ "$total" = 0 ] || [ "$linhas" = 0 ]; then
  echo "O backup não tem tabelas ou linhas para conferir." >&2
  falhas=$((falhas + 1))
fi
head -2 "$D/manifesto.txt"
echo "tabelas: $total, linhas: $linhas, diferenças: $falhas"
if [ "$erro" = 0 ]; then
  [ ! -s "$TMP/cron.txt" ] || echo "rotinas do pg_cron reagendadas: $(cat "$TMP/cron.txt")"
  [ "$MODO" != "--ensaio" ] || echo "ensaio: tudo desfeito, o destino continua vazio"
else
  echo "A restauração parou com erro (veja acima). Nada foi gravado." >&2
fi
[ "$falhas" = 0 ] && [ "$erro" = 0 ]
