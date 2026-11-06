// Venda de balcão (PDV) vinda do caixa do site ou do app de celular. Só lê o que o caixa escolhe:
// produtos e quantidades, cliente, tabela, ponto e como foi pago. O preço sai da tabela no servidor
// e venda_balcao no banco confere estoque, total e troco.
import { FORMAS_PDV, type FormaPdv } from "./vendas.ts";

export type ItemBalcao = { produto_id: string; quantidade: number };
export type PagamentoBalcao = { forma: FormaPdv; valor_cents: number; conta_id: string | null };
export type VendaBalcao = {
  client_id: string;
  cliente_id: string | null;
  // tabela escolhida no caixa; sem ela vale a do cliente (ou a padrão)
  lista_id: string | null;
  itens: ItemBalcao[];
  pagamentos: PagamentoBalcao[];
  ponto_venda_id: string | null; // de onde sai o peixe; sem ponto = piscicultura
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOuNulo = (v: unknown) => v === undefined || v === null || v === "" ? null : typeof v === "string" && UUID.test(v) ? v : undefined;
const inteiro = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1e9;
// Quantidade do item: o peixe vendido por kg aceita fração até o grama (3 casas); caixas vêm inteiras do caixa.
const quantidade = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e6 && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;

export function validarVendaBalcao(v: unknown): { ok: VendaBalcao } | { erro: string } {
  if (!v || typeof v !== "object") return { erro: "Venda inválida." };
  const d = v as Record<string, unknown>;
  if (typeof d.client_id !== "string" || !UUID.test(d.client_id)) return { erro: "Identificador da venda inválido." };
  const cliente = uuidOuNulo(d.cliente_id);
  const lista = uuidOuNulo(d.lista_id);
  const ponto = uuidOuNulo(d.ponto_venda_id);
  if (cliente === undefined) return { erro: "Cliente inválido." };
  if (lista === undefined) return { erro: "Tabela de preço inválida." };
  if (ponto === undefined) return { erro: "Ponto de venda inválido." };

  if (!Array.isArray(d.itens) || d.itens.length > 200) return { erro: "Toque nos produtos para montar a venda." };
  const itens: ItemBalcao[] = [];
  for (const i of d.itens as Record<string, unknown>[]) {
    if (!i || typeof i.produto_id !== "string" || !UUID.test(i.produto_id) || !quantidade(i.quantidade)) return { erro: "Produto ou quantidade inválida." };
    if ((i.quantidade as number) > 0) itens.push({ produto_id: i.produto_id, quantidade: i.quantidade as number });
  }
  if (!itens.length) return { erro: "Toque nos produtos para montar a venda." };

  if (!Array.isArray(d.pagamentos) || d.pagamentos.length > 20) return { erro: "Informe como o cliente pagou." };
  const pagamentos: PagamentoBalcao[] = [];
  for (const p of d.pagamentos as Record<string, unknown>[]) {
    if (!p || typeof p.forma !== "string" || !(p.forma in FORMAS_PDV) || !inteiro(p.valor_cents)) return { erro: "Pagamento inválido." };
    if ((p.valor_cents as number) === 0) continue;
    const forma = p.forma as FormaPdv;
    const conta = forma === "dinheiro" ? null : uuidOuNulo(p.conta_id);
    if (conta === undefined || (forma !== "dinheiro" && !conta)) return { erro: "Escolha a conta onde cai o Pix e o cartão." };
    pagamentos.push({ forma, valor_cents: p.valor_cents as number, conta_id: conta });
  }
  if (!pagamentos.length) return { erro: "Informe como o cliente pagou." };

  return { ok: { client_id: d.client_id, cliente_id: cliente, lista_id: lista, itens, pagamentos, ponto_venda_id: ponto } };
}
