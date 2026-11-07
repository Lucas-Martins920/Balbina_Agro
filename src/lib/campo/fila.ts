// Fila de envios do app de campo. Tudo que o tratador lança vai primeiro para o celular (IndexedDB, pelo armazém
// de src/lib/db/indexeddb.ts) e sai para o servidor quando há sinal (src/lib/sync/worker.ts, a cada 5 s). Cada item leva o client_id: reenviar não duplica nada no banco.
// Aqui fica só a regra (sem window), para os testes; a tela usa src/components/campo/fila-cliente.ts.

import { prontoAgora, type ComRetry } from "../sync/queue.ts";

export type TipoEnvio = "apontamento" | "biometria" | "insumo" | "abrir_lote" | "fechar_lote";

// Lançamento que o servidor já tinha no mesmo viveiro, dia e turno (resposta 409 do apontamento)
export type Existente = { origem: string; mortes: number; descartes: number; racao_kg: number | string; criado_em: string };

export type ItemFila = ComRetry & {
  client_id: string;
  tipo: TipoEnvio;
  corpo: Record<string, unknown>;
  rotulo: string;            // "Ração · Viveiro 2 · 50 kg", para a pessoa reconhecer o envio
  lote_id?: string;          // fechar_lote: o endereço leva o lote
  criado_em: string;
  // tentativas, proxima_em, erro e parado (erro que precisa da pessoa: não reenvia sozinho) vêm de ComRetry
  conflito?: Existente[];    // apontamento repetido no turno: espera somar ou descartar
};

// viveiro, data e turno: a tela marca o viveiro como lançado no turno mesmo antes de pedir os dados novos
export type Enviado = {
  client_id: string; tipo: TipoEnvio; rotulo: string; enviado_em: string; repetido?: boolean;
  viveiro_id?: string; data?: string; turno?: string;
};

// De onde o envio é (viveiro, data, turno), lido do corpo que vai ao servidor
export function marcaDoItem(item: Pick<ItemFila, "corpo">): { viveiro_id?: string; data?: string; turno?: string } {
  const c = item.corpo;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  return { viveiro_id: texto(c.viveiro_id), data: texto(c.data), turno: texto(c.turno) };
}

export const chaveFila = (empresa: string) => `balbina:campo:envios:${empresa}`;
export const chaveEnviados = (empresa: string) => `balbina:campo:enviados:${empresa}`;
export const MAX_ENVIADOS = 30;

const ROTAS: Record<Exclude<TipoEnvio, "fechar_lote">, string> = {
  apontamento: "/api/apontamentos",
  biometria: "/api/biometrias",
  insumo: "/api/lancar-insumos",
  abrir_lote: "/api/abrir-lote",
};

export function rotaDoItem(item: Pick<ItemFila, "tipo" | "lote_id">): string {
  if (item.tipo === "fechar_lote") return `/api/lotes/${encodeURIComponent(item.lote_id ?? "")}/fechar`;
  return ROTAS[item.tipo];
}

export type Desfecho =
  | { tipo: "enviado"; repetido: boolean }
  | { tipo: "sessao" }
  | { tipo: "conflito"; erro: string; existentes: Existente[] }
  | { tipo: "erro"; erro: string; parado: boolean };

// O que fazer com o item depois da resposta do servidor. Redirecionamento (opaco) é a sessão que caiu: o login
// devolve a página de entrar em vez do JSON.
export function desfecho(status: number, opaco: boolean, corpo: { erro?: string; conflito?: Existente[]; situacao?: string }): Desfecho {
  if (opaco || status === 401) return { tipo: "sessao" };
  if (status >= 200 && status < 300) return { tipo: "enviado", repetido: corpo.situacao === "repetido" };
  if (status === 409 && Array.isArray(corpo.conflito)) {
    return { tipo: "conflito", erro: corpo.erro ?? "Já existe lançamento neste viveiro, dia e turno.", existentes: corpo.conflito };
  }
  // 4xx: o dado foi recusado e só a pessoa resolve; 5xx e 429: tenta de novo sozinho na próxima rodada
  const parado = status >= 400 && status < 500 && status !== 408 && status !== 429;
  return { tipo: "erro", erro: corpo.erro ?? `O servidor respondeu ${status}. Vai de novo sozinho.`, parado };
}

// Itens que a sincronização manda agora: sem conflito, sem erro que espera a pessoa e já passada a espera depois
// de uma falha do servidor (src/lib/sync/queue.ts)
export function prontosParaEnvio(fila: ItemFila[], agora = Date.now()): ItemFila[] {
  return fila.filter((i) => !i.conflito && prontoAgora(i, agora));
}

export function resumoFila(fila: ItemFila[]) {
  const precisam = fila.filter((i) => i.conflito || i.parado).length;
  return { total: fila.length, aguardando: fila.length - precisam, precisam };
}

// Junta o novo envio ao histórico, mais novo primeiro, sem passar do limite
export function registrarEnviado(historico: Enviado[], novos: Enviado[]): Enviado[] {
  const ids = new Set(novos.map((n) => n.client_id));
  return [...novos, ...historico.filter((h) => !ids.has(h.client_id))].slice(0, MAX_ENVIADOS);
}

// Fila lida do armazém: descarta o que não tem a forma de um envio (versão antiga, cota corrompida)
export function lerFila(bruto: string | null): ItemFila[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter((i): i is ItemFila =>
      i && typeof i === "object" && typeof i.client_id === "string" && typeof i.tipo === "string" && i.tipo in { ...ROTAS, fechar_lote: 1 }
      && i.corpo && typeof i.corpo === "object" && typeof i.rotulo === "string");
  } catch {
    return [];
  }
}

// O viveiro já tem o apontamento deste turno lançado neste celular? "fila" (esperando sinal) ou "enviado".
export function apontamentoDoTurno(viveiro: string, data: string, turno: string, fila: ItemFila[], enviados: Enviado[]): "fila" | "enviado" | null {
  if (fila.some((i) => i.tipo === "apontamento" && i.corpo.viveiro_id === viveiro && i.corpo.data === data && i.corpo.turno === turno)) return "fila";
  if (enviados.some((e) => e.tipo === "apontamento" && e.viveiro_id === viveiro && e.data === data && e.turno === turno)) return "enviado";
  return null;
}
