import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CAUSAS_MORTE } from "./causas-morte";

// Leitura por IA (C3 documentos e A8 mortalidade por foto do estudo de automação). Usa a API da
// Anthropic com a chave ANTHROPIC_API_KEY do servidor. Tudo que sai daqui é PROPOSTA: a tela mostra
// preenchido e a pessoa confere antes de gravar. Sem chave, as telas escondem os botões.

export const MODELO = "claude-opus-5-5";
export const TIPOS_ARQUIVO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type TipoArquivo = (typeof TIPOS_ARQUIVO)[number];
export const TAMANHO_MAXIMO = 4 * 1024 * 1024; // a Vercel recusa corpo acima de 4,5 MB

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class ErroIa extends Error {}

export function cliente() {
  if (!iaConfigurada()) throw new ErroIa("A leitura por IA não está ligada no servidor (falta a chave ANTHROPIC_API_KEY).");
  return new Anthropic({ timeout: 90_000, maxRetries: 1 });
}

function blocoArquivo(base64: string, tipo: TipoArquivo): Anthropic.Beta.BetaContentBlockParam {
  return tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: tipo, data: base64 } };
}

// Uma chamada com saída estruturada. Recusa ou falha de leitura viram ErroIa com texto para a tela.
async function ler<T extends z.ZodType>(esquema: T, sistema: string, conteudo: Anthropic.Beta.BetaContentBlockParam[]): Promise<z.infer<T>> {
  try {
    const resposta = await cliente().beta.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(esquema) },
      system: sistema,
      messages: [{ role: "user", content: conteudo }],
    });
    if (resposta.stop_reason === "refusal") throw new ErroIa("A IA não quis ler este arquivo. Lance à mão.");
    if (!resposta.parsed_output) throw new ErroIa("A IA não conseguiu ler este arquivo. Tente uma foto mais nítida ou lance à mão.");
    return resposta.parsed_output as z.infer<T>;
  } catch (e) {
    if (e instanceof ErroIa) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new ErroIa("Muitas leituras ao mesmo tempo. Tente de novo em um minuto.");
    if (e instanceof Anthropic.AuthenticationError) throw new ErroIa("A chave da IA no servidor não vale. Avise o suporte.");
    if (e instanceof Anthropic.APIError) throw new ErroIa(`A IA falhou (${e.status ?? "sem resposta"}). Tente de novo ou lance à mão.`);
    throw e;
  }
}

const Documento = z.object({
  tipo: z.enum(["boleto", "nota_fiscal", "recibo", "fatura", "outro"]),
  fornecedor_nome: z.string().nullable(),
  fornecedor_documento: z.string().nullable().describe("CNPJ ou CPF de quem cobra, só números"),
  valor: z.number().nullable().describe("valor a pagar em reais, ex.: 1234.56"),
  vencimento: z.string().nullable().describe("AAAA-MM-DD"),
  emissao: z.string().nullable().describe("AAAA-MM-DD"),
  linha_digitavel: z.string().nullable().describe("linha digitável do boleto, só números, exatamente como impressa"),
  numero: z.string().nullable().describe("número da nota, fatura ou documento"),
  descricao: z.string().describe("o que foi comprado ou cobrado, em até 8 palavras"),
});
export type DocumentoLido = z.infer<typeof Documento>;

export async function lerDocumento(base64: string, tipo: TipoArquivo): Promise<DocumentoLido> {
  return ler(Documento,
    "Você lê documentos de cobrança de uma piscicultura de engorda no Brasil (boletos, notas fiscais, recibos, faturas de energia e água). " +
    "Extraia só o que está escrito no documento; o que não estiver legível fica null. Quem cobra é o fornecedor (beneficiário/cedente/emitente), nunca a piscicultura pagadora. " +
    "Copie a linha digitável dígito por dígito.",
    [blocoArquivo(base64, tipo), { type: "text", text: "Extraia os dados desta cobrança." }]);
}

const CHAVES_CAUSA = CAUSAS_MORTE.map((c) => c.chave) as [string, ...string[]];
const Mortalidade = z.object({
  quantidade: z.number().int().describe("quantos peixes mortos aparecem na foto"),
  causa: z.enum([...CHAVES_CAUSA, "nao_sei"]),
  confianca: z.enum(["alta", "media", "baixa"]),
  observacao: z.string().describe("o que se vê que justifica a causa, em uma frase"),
});
export type MortalidadeLida = z.infer<typeof Mortalidade>;

export async function contarMortes(base64: string, tipo: Exclude<TipoArquivo, "application/pdf">): Promise<MortalidadeLida> {
  return ler(Mortalidade,
    "Você ajuda o tratador de uma piscicultura de engorda a registrar os peixes mortos do turno. Conte os peixes mortos visíveis na foto " +
    "(não conte duas vezes o mesmo peixe) e sugira a causa provável só pelo que se vê: " +
    CAUSAS_MORTE.map((c) => `${c.chave} (${c.nome})`).join(", ") +
    ". Sem sinal claro, use nao_sei. É uma sugestão para a pessoa confirmar, não um diagnóstico veterinário.",
    [blocoArquivo(base64, tipo), { type: "text", text: "Quantos peixes mortos e qual a causa provável?" }]);
}
