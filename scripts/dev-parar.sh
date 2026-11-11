#!/usr/bin/env bash
# Desliga TUDO do ambiente de desenvolvimento e devolve a memória ao Linux (docs/ambiente-leve.md):
#   1. next dev     2. Supabase local (supabase stop; os dados ficam guardados)
#   3. contêineres que sobrarem, docker.service, docker.socket e containerd (ou o Docker Desktop)
#   4. VS Code (por último: se você rodou daqui do terminal do VS Code, ele fecha junto)
# Opções:  --manter-code   não fecha o VS Code      --manter-docker   para o Supabase mas deixa o Docker ligado
set -uo pipefail
cd "$(dirname "$0")/.."

MANTER_CODE=0
MANTER_DOCKER=0
for a in "$@"; do
  case "$a" in
    --manter-code) MANTER_CODE=1 ;;
    --manter-docker) MANTER_DOCKER=1 ;;
    *) echo "Opção desconhecida: $a"; exit 2 ;;
  esac
done

antes=$(free -m | awk '/^Mem:/ {print $7}')
docker_desktop=0
systemctl --user cat docker-desktop.service >/dev/null 2>&1 && docker_desktop=1

# pede a senha do sudo agora, antes de o VS Code (e talvez este terminal) fechar
if [ "$MANTER_DOCKER" = 0 ] && [ "$docker_desktop" = 0 ]; then sudo -v || exit 1; fi

echo "1/4 Parando o next dev..."
pkill -TERM -f "scripts/local.mjs" 2>/dev/null
pkill -TERM -f "next dev" 2>/dev/null
pkill -TERM -f "next-server" 2>/dev/null
sleep 2
pkill -KILL -f "next dev|next-server" 2>/dev/null

if docker info >/dev/null 2>&1; then
  echo "2/4 Parando o Supabase local (os dados ficam guardados)..."
  npx --yes supabase@2.122.0 stop >/dev/null 2>&1 || echo "  (o supabase stop falhou; os contêineres param no passo 3)"
  if [ "$MANTER_DOCKER" = 0 ]; then
    echo "3/4 Parando os contêineres que sobraram e desligando o Docker..."
    restantes=$(docker ps -q)
    [ -n "$restantes" ] && docker stop $restantes >/dev/null
  fi
else
  echo "2/4 Docker já estava desligado."
fi

if [ "$MANTER_DOCKER" = 0 ]; then
  if [ "$docker_desktop" = 1 ]; then
    systemctl --user stop docker-desktop 2>/dev/null
  else
    # o docker.socket primeiro: com ele ligado, qualquer comando docker acorda o serviço de novo
    sudo systemctl stop docker.socket docker.service containerd.service 2>/dev/null
  fi
  echo "  Docker desligado (o npm run dev:iniciar liga de novo)."
fi

if [ "$MANTER_CODE" = 0 ] && pgrep -f "/usr/share/code/code|/snap/code/|/opt/visual-studio-code/code" >/dev/null 2>&1; then
  depois=$(free -m | awk '/^Mem:/ {print $7}')
  echo "4/4 Fechando o VS Code. Memória livre até aqui: ${antes} MB -> ${depois} MB."
  pkill -TERM -f "/usr/share/code/code|/snap/code/|/opt/visual-studio-code/code"
  sleep 5
  pkill -KILL -f "/usr/share/code/code|/snap/code/|/opt/visual-studio-code/code" 2>/dev/null
else
  echo "4/4 VS Code mantido."
fi

depois=$(free -m | awk '/^Mem:/ {print $7}')
echo "Pronto. Memória disponível: ${antes} MB -> ${depois} MB."
