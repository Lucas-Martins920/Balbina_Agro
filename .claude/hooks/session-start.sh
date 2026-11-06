#!/usr/bin/env bash
# Prepara o Graphify (grafo do código) no início de cada sessão do Claude Code.
# Na nuvem instala o CLI se faltar; localmente só usa se já estiver instalado.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if ! command -v graphify >/dev/null 2>&1; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && command -v uv >/dev/null 2>&1; then
    uv tool install -q 'graphifyy[sql]' >/dev/null 2>&1 || exit 0
    export PATH="$HOME/.local/bin:$PATH"
    [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  else
    exit 0
  fi
fi

# SkillSpector (scanner de skills da NVIDIA, usado pela skill skill-inspector): instala em segundo plano na nuvem.
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && ! command -v skillspector >/dev/null 2>&1 && command -v uv >/dev/null 2>&1; then
  (uv tool install -q git+https://github.com/NVIDIA/skillspector.git >/dev/null 2>&1 &)
fi

# Só AST, sem chamada de LLM; leva poucos segundos.
graphify update . >/dev/null 2>&1 || true
exit 0
