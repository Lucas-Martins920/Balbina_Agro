// Pedido feito pelo vendedor externo no celular. Pode chegar horas depois, quando o celular pega sinal;
// o client_id torna o reenvio inofensivo (criar_pedido devolve o mesmo pedido).
import { formatarData, formatarMoeda, somarDias } from "./formato.ts";
import { FORMAS_PAGAMENTO } from "./titulos.ts";
import { CONDICOES } from "./vendas.ts";

export type ItemPedidoCampo = { produto_id: string; quantidade: number };
export type PedidoCampo = {
  client_id: string;
  cliente_id: string;
  data: string;
  condicao: string;
  parcelas: { dias: number; pct: number }[];
  forma_pagamento: string | null;
  entrega: string | null;
  observacoes: string;
  itens: ItemPedidoCampo[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
// Quanto tempo um pedido pode ficar na fila do celular sem sinal
export const DIAS_FILA = 7;

export function validarPedidoCampo(v: unknown, hoje: string): { ok: PedidoCampo } | { erro: string } {
  if (!v || typeof v !== "object") return { erro: "Pedido inválido." };
  const p = v as Record<string, unknown>;
  if (typeof p.client_id !== "string" || !UUID.test(p.client_id)) return { erro: "Identificador do envio inválido." };
  if (typeof p.cliente_id !== "string" || !UUID.test(p.cliente_id)) return { erro: "Escolha o cliente." };
  if (typeof p.data !== "string" || !DATA.test(p.data) || p.data > hoje) return { erro: "Data do pedido inválida." };
  if (p.data < somarDias(hoje, -DIAS_FILA)) return { erro: `Pedido com mais de ${DIAS_FILA} dias na fila: refaça no celular.` };
  const condicao = typeof p.condicao === "string" ? CONDICOES[p.condicao] : undefined;
  if (!condicao) return { erro: "Escolha a condição de pagamento." };
  const forma = p.forma_pagamento ?? null;
  if (forma !== null && (typeof forma !== "string" || !(forma in FORMAS_PAGAMENTO))) return { erro: "Forma de pagamento inválida." };
  const entrega = p.entrega ?? null;
  if (entrega !== null && (typeof entrega !== "string" || !DATA.test(entrega) || entrega < p.data)) return { erro: "A entrega não pode ser antes do pedido." };
  if (!Array.isArray(p.itens)) return { erro: "Adicione pelo menos um produto." };

  // O preço não vem do celular: o banco aplica a tabela do cliente no dia do pedido
  const somas = new Map<string, number>();
  for (const i of p.itens as unknown[]) {
    const item = (i ?? {}) as Record<string, unknown>;
    if (typeof item.produto_id !== "string" || !UUID.test(item.produto_id)) return { erro: "Produto inválido no pedido." };
    const q = item.quantidade;
    if (typeof q !== "number" || !Number.isFinite(q) || q < 0 || q > 1e6) return { erro: "Quantidade inválida." };
    if (q > 0) somas.set(item.produto_id, (somas.get(item.produto_id) ?? 0) + q);
  }
  if (somas.size === 0) return { erro: "Adicione pelo menos um produto." };

  return {
    ok: {
      client_id: p.client_id, cliente_id: p.cliente_id, data: p.data, condicao: p.condicao as string, parcelas: condicao.parcelas,
      forma_pagamento: forma as string | null, entrega: entrega as string | null,
      observacoes: typeof p.observacoes === "string" ? p.observacoes.trim().slice(0, 500) : "",
      itens: [...somas.entries()].map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
    },
  };
}

// Texto para o vendedor mandar ao cliente pelo WhatsApp depois de fechar o pedido
export function resumoWhatsapp(p: {
  empresa: string; cliente: string; numero: number | null; itens: { nome: string; quantidade: number; preco_cents: number | null }[];
  total_cents: number; condicao: string; entrega: string | null;
}) {
  const linhas = [
    `${p.empresa} · ${p.numero ? `Pedido ${p.numero}` : "Pedido"} para ${p.cliente}`,
    "",
    ...p.itens.map((i) => `${String(i.quantidade).replace(".", ",")} × ${i.nome}${i.preco_cents === null ? "" : ` (${formatarMoeda(i.preco_cents)})`}`),
    "",
    `Total: ${formatarMoeda(p.total_cents)}`,
    `Pagamento: ${p.condicao}`,
  ];
  if (p.entrega) linhas.push(`Entrega: ${formatarData(p.entrega)}`);
  return linhas.join("\n");
}
