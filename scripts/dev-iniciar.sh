#!/usr/bin/env bash
# Liga o ambiente de desenvolvimento no modo leve, para notebook de 8 GB no Linux (docs/ambiente-leve.md).
#   npm run dev:iniciar                 Docker + Supabase enxuto (com limites de RAM/CPU) + next dev
#   npm run dev:iniciar -- --studio     o mesmo, com o Supabase Studio (mais ~400 MB)
#   npm run dev:iniciar -- --code       também abre o VS Code nesta pasta
# Para desligar tudo e devolver a memória: npm run dev:parar
set -euo pipefail
cd "$(dirname "$0")/.."

ABRIR_CODE=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --code) ABRIR_CODE=1 ;;
    *) ARGS+=("$a") ;;
  esac
done

# 1. Docker: liga só agora (o dev:parar desliga o docker.service e o docker.socket)
if ! docker info >/dev/null 2>&1; then
  if systemctl --user list-unit-files docker-desktop.service >/dev/null 2>&1 && systemctl --user cat docker-desktop.service >/dev/null 2>&1; then
    echo "Ligando o Docker Desktop..."
    systemctl --user start docker-desktop
  else
    echo "Ligando o Docker (pede a senha do sudo)..."
    sudo systemctl start docker.socket docker.service
  fi
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { echo "✖ O Docker não respondeu em 60 s. Veja: systemctl status docker"; exit 1; }
fi

if [ "$ABRIR_CODE" = 1 ] && command -v code >/dev/null 2>&1; then
  # o .vscode/settings.json já tira node_modules, .next e afins do vigia de arquivos e da busca
  code . >/dev/null 2>&1 &
fi

# 2. Supabase enxuto + limites + next dev, com prioridade baixa de CPU e disco:
#    o mouse, o teclado e o Chrome continuam respondendo enquanto o Turbopack compila.
export BALBINA_DEV_LEVE=1
exec nice -n 10 ionice -c 2 -n 7 node scripts/local.mjs dev "${ARGS[@]+"${ARGS[@]}"}"
