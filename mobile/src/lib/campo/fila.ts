import type { Existente, Pendente } from "./tipos";

// Regras da fila de apontamentos (sem React nem armazenamento, para testar).

// Já tem lançamento do mesmo viveiro, data e turno esperando envio?
export function repetidoNaFila(fila: Pendente[], p: Pick<Pendente, "viveiro_id" | "data" | "turno">) {
  return fila.find((x) => x.viveiro_id === p.viveiro_id && x.data === p.data && x.turno === p.turno);
}

// O que vai para o servidor agora: conflito espera a decisão de quem apontou.
export function paraEnviar(fila: Pendente[]) {
  return fila.filter((p) => !p.conflito);
}

export type Resultado =
  | { client_id: string; tipo: "enviado" }
  | { client_id: string; tipo: "erro"; erro: string }
  | { client_id: string; tipo: "conflito"; erro: string; conflito: Existente[] };

// Aplica as respostas na fila RELIDA (pode ter entrado lançamento novo durante o envio).
export function aplicarResultados(fila: Pendente[], resultados: Resultado[]): Pendente[] {
  const porId = new Map(resultados.map((r) => [r.client_id, r]));
  return fila.flatMap((p) => {
    const r = porId.get(p.client_id);
    if (!r) return [p];
    if (r.tipo === "enviado") return [];
    return [{ ...p, erro: r.erro, conflito: r.tipo === "conflito" ? r.conflito : undefined }];
  });
}

// "Somar mesmo assim", "tentar de novo", "enviar sem baixar a ração": volta para a fila limpo.
export function reenviar(fila: Pendente[], id: string, mudar: (p: Pendente) => Pendente = (p) => p): Pendente[] {
  return fila.map((p) => (p.client_id === id ? { ...mudar(p), erro: undefined, conflito: undefined } : p));
}

export function descartar(fila: Pendente[], id: string): Pendente[] {
  return fila.filter((p) => p.client_id !== id);
}

// Corpo para /api/app/apontamentos: só os campos que o servidor valida
export function corpoEnvio(p: Pendente) {
  const { viveiro_nome: _nome, conflito: _c, erro: _e, ...resto } = p;
  return resto;
}
