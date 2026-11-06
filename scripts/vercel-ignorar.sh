#!/usr/bin/env bash
# ignoreCommand da Vercel (vercel.json): sair com 0 PULA o deploy; sair com 1 constrói.
# - Produção (branch de produção da Vercel, o master): sempre constrói.
# - Preview: só o branch Teste-Desevolvimento vira o site de teste, e só depois que as variáveis de Preview
#   do Supabase de teste estiverem cadastradas (BALBINA_AMBIENTE=testes). Recusa se o preview apontar
#   para o banco de produção (BALBINA_REF_PRODUCAO). Passo a passo: docs/site-de-teste.md.
BRANCH_TESTE="Teste-Desevolvimento"
if [ "$VERCEL_ENV" = production ]; then exit 1; fi
if [ "$VERCEL_ENV" != preview ] || [ "$VERCEL_GIT_COMMIT_REF" != "$BRANCH_TESTE" ]; then
  echo "Preview pulado: só o branch $BRANCH_TESTE vira o site de teste."
  exit 0
fi
if [ "$BALBINA_AMBIENTE" != testes ]; then
  echo "Preview pulado: falta BALBINA_AMBIENTE=testes nas variáveis de Preview (docs/site-de-teste.md)."
  exit 0
fi
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "Preview recusado: NEXT_PUBLIC_SUPABASE_URL de Preview está vazia."
  exit 0
fi
IFS=',' read -ra REFS <<< "${BALBINA_REF_PRODUCAO:-}"
for ref in "${REFS[@]}"; do
  ref="${ref// /}"
  if [ -n "$ref" ] && [[ "$NEXT_PUBLIC_SUPABASE_URL" == *"$ref"* ]]; then
    echo "Preview recusado: NEXT_PUBLIC_SUPABASE_URL de Preview é a da produção."
    exit 0
  fi
done
echo "Construindo o site de teste ($BRANCH_TESTE)."
exit 1
