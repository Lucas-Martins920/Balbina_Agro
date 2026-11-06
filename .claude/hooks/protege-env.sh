#!/usr/bin/env bash
# Impede o Claude de editar arquivos .env (segredos). .env.example pode.
caminho=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$(basename -- "$caminho")" in
  .env.example) exit 0 ;;
  .env|.env.*) echo "Arquivo de segredos ($caminho): edite à mão." >&2; exit 2 ;;
esac
exit 0
