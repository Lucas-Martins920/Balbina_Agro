import { ENDPOINTS } from "@/lib/api/catalogo";

// Índice público da API (sem chave): o que existe e onde ler a documentação.
export function GET() {
  return Response.json({
    nome: "API do Balbina",
    versao: "v1",
    autenticacao: "Authorization: Bearer balbina_... (chave criada pelo usuário master em Configurações > API)",
    endpoints: ENDPOINTS.map(({ metodo, caminho, escopo, descricao }) => ({ metodo, caminho, escopo, descricao })),
  });
}
