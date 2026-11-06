// Formato de retorno das server actions usadas pelos formulários.
export type EstadoAcao = { erro?: string; ok?: string; versao?: number };

export function falha(erro: string): EstadoAcao {
  return { erro };
}

export function sucesso(ok: string): EstadoAcao {
  return { ok, versao: Date.now() };
}

// Mensagens do Postgres chegam cruas; tira o prefixo técnico quando houver.
export function mensagemBanco(erro: { message: string; code?: string }) {
  if (erro.code === "23505") return "Já existe um registro com esses dados.";
  // apagar algo que outro registro usa (FK restrict); outros 23503 são mensagens nossas
  if (erro.code === "23503" && erro.message.startsWith("update or delete on table")) return "Este cadastro já está em uso em outros lançamentos. Desative ou arquive em vez de excluir.";
  if (erro.code === "42501" && erro.message.includes("row-level security")) {
    return "Seu usuário não tem permissão para esta ação. Peça acesso ao usuário master da empresa.";
  }
  return erro.message;
}
