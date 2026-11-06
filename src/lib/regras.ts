// Vocabulário das regras de conciliação (o banco valida a estrutura em regras_conciliacao)
export const TIPOS_REGRA: Record<string, string> = {
  pagamento: "Pagamento (saída)",
  recebimento: "Recebimento (entrada)",
  transferencia: "Transferência entre contas",
  ignorar: "Ignorar (não lançar no financeiro)",
};

export const CAMPOS_REGRA: Record<string, string> = {
  descricao: "Descrição",
  cpf_cnpj: "CPF/CNPJ",
  valor: "Valor (R$)",
};

export const OPERADORES_REGRA: Record<string, string> = {
  contem: "contém",
  comeca_com: "começa com",
  igual: "é igual a",
  maior: "maior que",
  menor: "menor que",
  vazio: "está vazio",
};

export type Condicao = { campo: string; operador: string; valor: string };

// Condição para "lembrar" um lançamento: o CPF/CNPJ quando o banco manda, senão o começo da descrição sem números
export function condicaoDoLancamento(descricao: string, cpfCnpj: string | null): Condicao {
  if (cpfCnpj) return { campo: "cpf_cnpj", operador: "igual", valor: cpfCnpj };
  const base = descricao.replace(/[\d/.,:-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  return { campo: "descricao", operador: "comeca_com", valor: base || descricao.trim() };
}

export function descreverCondicao(c: Condicao) {
  return `${CAMPOS_REGRA[c.campo] ?? c.campo} ${OPERADORES_REGRA[c.operador] ?? c.operador}${c.operador === "vazio" ? "" : ` "${c.valor}"`}`;
}
