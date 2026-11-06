#!/usr/bin/env bash
# Lembra o Claude de consultar o grafo antes de buscar no código.
# Não faz nada se o Graphify não estiver instalado.
command -v graphify >/dev/null 2>&1 || exit 0
exec graphify hook-guard "$1"
