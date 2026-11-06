// Régua de cobrança (D4): em que ponto cada conta a receber está e o lembrete pronto para o WhatsApp.
import { formatarData, formatarMoeda, somarDias } from "./formato.ts";
import { numeroWhatsApp } from "./whatsapp-texto.ts";

export type Faixa = "antes" | "hoje" | "atraso" | "atraso_longo";
export const FAIXAS: Record<Faixa, string> = {
  antes: "Vence nos próximos 3 dias",
  hoje: "Vence hoje",
  atraso: "Venceu há até 7 dias",
  atraso_longo: "Venceu há mais de 7 dias",
};
export const DIAS_ANTES = 3;
export const DIAS_ATRASO = 7;

export function faixaDaRegua(vencimento: string, hoje: string): Faixa | null {
  if (vencimento === hoje) return "hoje";
  if (vencimento > hoje) return vencimento <= somarDias(hoje, DIAS_ANTES) ? "antes" : null;
  return vencimento >= somarDias(hoje, -DIAS_ATRASO) ? "atraso" : "atraso_longo";
}

const moeda = (c: number) => formatarMoeda(c).replace(/ /g, " ");

export function textoLembreteCobranca(p: { cliente: string; empresa: string; valorCents: number; vencimento: string; faixa: Faixa; segundaVia: string | null }) {
  const via = p.segundaVia ? ` Boleto/Pix: ${p.segundaVia}` : "";
  const valor = moeda(p.valorCents);
  const data = formatarData(p.vencimento);
  if (p.faixa === "antes") return `Olá, ${p.cliente}! Lembrete da ${p.empresa}: a conta de ${valor} vence em ${data}.${via}`;
  if (p.faixa === "hoje") return `Olá, ${p.cliente}! Lembrete da ${p.empresa}: a conta de ${valor} vence hoje.${via}`;
  return `Olá, ${p.cliente}! A conta de ${valor} com a ${p.empresa} venceu em ${data} e ainda consta em aberto.${via || " Se já pagou, desconsidere."}`;
}

// wa.me com o número no formato internacional (Brasil por padrão). Telefone inválido: sem link.
export function linkWhatsApp(telefone: string | null | undefined, texto: string) {
  const n = numeroWhatsApp(telefone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}
