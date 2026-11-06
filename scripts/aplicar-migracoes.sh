#!/usr/bin/env bash
# Aplica no banco as migrations de supabase/migrations que ainda não rodaram.
# Uso: DATABASE_URL=postgresql://... ./scripts/aplicar-migracoes.sh
# Cada arquivo roda numa transação e fica registrado em balbina_meta.migracoes.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?defina DATABASE_URL com a connection string do banco}"
export PGOPTIONS='--client-min-messages=warning'
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
create schema if not exists balbina_meta;
create table if not exists balbina_meta.migracoes (
  versao text primary key,
  aplicada_em timestamptz not null default now()
);
SQL

# Bancos onde o SQL foi colado à mão antes deste script existir: registra o que já está lá,
# reconhecendo cada migration por um objeto que ela cria.
if [ "$("${PSQL[@]}" -tAc "select count(*) from balbina_meta.migracoes")" = "0" ]; then
  "${PSQL[@]}" <<'SQL'
insert into balbina_meta.migracoes (versao)
select v from (values
  ('20261026000001', to_regclass('public.empresas') is not null),
  ('20261026000002', to_regprocedure('public.criar_empresa(text,text,text)') is not null),
  ('20261026000003', to_regprocedure('public.povoar_lote(uuid,text,uuid,date,date,uuid,integer,bigint,uuid)') is not null),
  ('20261026000004', to_regprocedure('public.gerar_recorrencias(uuid)') is not null),
  ('20261026000005', to_regprocedure('public.importar_extrato(uuid,text,jsonb,text)') is not null)
) x(v, existe)
where existe
on conflict do nothing;
SQL
fi

aplicadas=0
for f in supabase/migrations/*.sql; do
  versao=$(basename "$f" | cut -d_ -f1)
  if [ "$("${PSQL[@]}" -tAc "select count(*) from balbina_meta.migracoes where versao = '$versao'")" = "1" ]; then
    continue
  fi
  echo "Aplicando $(basename "$f")"
  "${PSQL[@]}" --single-transaction -f "$f" -c "insert into balbina_meta.migracoes (versao) values ('$versao')"
  aplicadas=$((aplicadas + 1))
done
echo "Migrations aplicadas agora: $aplicadas"
