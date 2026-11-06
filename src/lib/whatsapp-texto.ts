// WhatsApp do Balbina (H2): partes sem rede, testadas em whatsapp-texto.test.ts. O envio e o
// download ficam em whatsapp.ts (servidor).
import { createHmac, timingSafeEqual } from "node:crypto";
import { formatarData, formatarMoeda } from "./formato.ts";

// Celular no formato que a Meta usa (55 + DDD + número). Sem DDI, assume Brasil. Inválido: null.
export function numeroWhatsApp(telefone: string | null | undefined): string | null {
  let n = (telefone ?? "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = `55${n}`;
  return /^55\d{10,11}$/.test(n) ? n : null;
}

// Mesma regra de app.chave_celular no banco: DDD + 8 últimos dígitos (a Meta pode mandar sem o 9).
export function chaveCelular(numero: string | null | undefined): string | null {
  const n = numeroWhatsApp(numero);
  return n ? `${n.slice(2, 4)}${n.slice(-8)}` : null;
}

export function formatarCelular(numero: string): string {
  const n = numero.replace(/^55/, "");
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
}

// Parâmetro de mensagem de modelo: a Meta recusa quebra de linha, tabulação e mais de 4 espaços seguidos.
export function parametroModelo(texto: string, maximo = 900): string {
  const limpo = texto.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (limpo.length > maximo ? `${limpo.slice(0, maximo - 1)}…` : limpo) || "-";
}

// Cabeçalho X-Hub-Signature-256 = "sha256=" + HMAC-SHA256 do corpo cru com o segredo do app da Meta.
export function assinaturaConfere(corpo: string, cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(corpo, "utf8").digest("hex"));
  const recebido = Buffer.from(cabecalho.slice(7));
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export type MensagemRecebida = {
  id: string; de: string;
  tipo: "texto" | "imagem" | "documento" | "audio" | "outro";
  texto?: string;
  midia?: { id: string; mime: string; nome: string };
};

type Webhook = {
  entry?: { changes?: { field?: string; value?: { messages?: Record<string, unknown>[] } }[] }[];
};

// Tira do corpo do webhook só as mensagens recebidas (ignora status de entrega e o resto).
export function lerWebhook(corpo: unknown): MensagemRecebida[] {
  const lista: MensagemRecebida[] = [];
  for (const e of (corpo as Webhook)?.entry ?? []) {
    for (const c of e.changes ?? []) {
      for (const m of c.value?.messages ?? []) {
        const id = String(m.id ?? "");
        const de = String(m.from ?? "").replace(/\D/g, "");
        if (!id || !de) continue;
        const tipo = String(m.type ?? "");
        const bloco = (m[tipo] ?? {}) as { body?: string; id?: string; mime_type?: string; filename?: string; caption?: string };
        if (tipo === "text") lista.push({ id, de, tipo: "texto", texto: bloco.body ?? "" });
        else if ((tipo === "image" || tipo === "document") && bloco.id) {
          const mime = (bloco.mime_type ?? "").split(";")[0].trim().toLowerCase();
          lista.push({ id, de, tipo: tipo === "image" ? "imagem" : "documento", texto: bloco.caption,
            midia: { id: bloco.id, mime, nome: bloco.filename ?? (tipo === "image" ? "foto.jpg" : "documento") } });
        } else if (tipo === "audio") lista.push({ id, de, tipo: "audio" });
        else lista.push({ id, de, tipo: "outro" });
      }
    }
  }
  return lista;
}

export type Comando = { tipo: "vincular"; codigo: string } | { tipo: "sair" } | { tipo: "voltar" } | { tipo: "ajuda" };

export function comandoDoTexto(texto: string): Comando {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const codigo = /^(?:balbina\s*)?(\d{3})\s?(\d{3})$/.exec(t);
  if (codigo) return { tipo: "vincular", codigo: codigo[1] + codigo[2] };
  if (/^(sair|parar|pare|stop|cancelar)$/.test(t)) return { tipo: "sair" };
  if (/^(voltar|ativar|iniciar|start)$/.test(t)) return { tipo: "voltar" };
  return { tipo: "ajuda" };
}

export const AJUDA = "Mande aqui foto ou PDF de boleto, nota ou recibo (ou o XML da NF-e) que ele entra no Balbina para você conferir. " +
  "Para parar os avisos, mande SAIR; para voltar, VOLTAR.";

export type FaixaCobranca = "antes" | "hoje" | "atraso";

// Parâmetros do modelo balbina_cobranca (docs/automacoes.md):
// "Olá, {{1}}! Aqui é a {{2}}, pelo Balbina. Lembrete: {{3}}. {{4}} Obrigado!"
export function parametrosCobranca(p: { cliente: string; empresa: string; saldoCents: number; vencimento: string; faixa: FaixaCobranca; segundaVia: string | null }): string[] {
  const valor = formatarMoeda(p.saldoCents).replace(/\s/g, " ");
  const situacao = p.faixa === "antes" ? `a conta de ${valor} vence em ${formatarData(p.vencimento)}`
    : p.faixa === "hoje" ? `a conta de ${valor} vence hoje`
    : `a conta de ${valor} venceu em ${formatarData(p.vencimento)} e ainda consta em aberto`;
  const via = p.segundaVia ? `Boleto/Pix: ${p.segundaVia}` : p.faixa === "atraso" ? "Se já pagou, desconsidere." : "Qualquer dúvida, fale com a gente.";
  return [p.cliente, p.empresa, situacao, via].map((x) => parametroModelo(x, 300));
}
