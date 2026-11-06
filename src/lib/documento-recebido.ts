import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerLinhaDigitavel } from "./boleto";
import { ErroIa, lerDocumento, TAMANHO_MAXIMO, TIPOS_ARQUIVO, type DocumentoLido, type TipoArquivo } from "./ia";

// C3/C4: um arquivo (foto ou PDF) vira documento recebido com os dados que a IA leu. A linha digitável
// só fica se os dígitos conferirem; valor e vencimento do boleto valem mais que o que a IA leu.
export type DadosDocumento = DocumentoLido & { linha_conferida: boolean };

export function tipoAceito(tipo: string): tipo is TipoArquivo {
  return (TIPOS_ARQUIVO as readonly string[]).includes(tipo);
}

const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function conferirLeitura(lido: DocumentoLido, hoje: string): { dados: DadosDocumento; linha: string | null } {
  const boleto = lido.linha_digitavel ? lerLinhaDigitavel(lido.linha_digitavel, hoje) : null;
  const documento = lido.fornecedor_documento?.replace(/\D/g, "") || null;
  const dados: DadosDocumento = {
    ...lido,
    fornecedor_documento: documento && /^(\d{11}|\d{14})$/.test(documento) ? documento : null,
    valor: boleto?.valor_cents ? boleto.valor_cents / 100 : lido.valor,
    vencimento: boleto?.vencimento ?? data(lido.vencimento),
    emissao: data(lido.emissao),
    linha_conferida: Boolean(boleto),
  };
  return { dados, linha: boleto?.linha ?? null };
}

export type Arquivo = { base64: string; tipo: string; nome: string; tamanho: number };

// Lê e grava. Quem chama escolhe o cliente: o do usuário (upload, com as permissões dele) ou o do
// servidor (caixa de e-mail). Na caixa de e-mail, falha da IA grava o documento com o erro, para a
// pessoa ver que chegou e lançar à mão.
export async function receberDocumento(db: SupabaseClient, empresa: string, arquivo: Arquivo, origem: "upload" | "email" | "whatsapp",
  hoje: string, remetente?: string): Promise<{ id?: string; erro?: string }> {
  if (!tipoAceito(arquivo.tipo)) return { erro: "Mande PDF ou foto (JPG, PNG ou WebP)." };
  if (arquivo.tamanho > TAMANHO_MAXIMO) return { erro: "Arquivo grande demais (até 4 MB). Mande uma foto ou um PDF menor." };

  let dados: DadosDocumento | Record<string, never> = {};
  let linha: string | null = null;
  let erro: string | null = null;
  const uso = await db.rpc("registrar_uso_ia", { p_empresa: empresa, p_tipo: "documento" });
  if (uso.error) erro = uso.error.message;
  else {
    try {
      ({ dados, linha } = conferirLeitura(await lerDocumento(arquivo.base64, arquivo.tipo), hoje));
    } catch (e) {
      if (!(e instanceof ErroIa)) throw e;
      erro = e.message;
    }
  }
  if (erro && origem === "upload") return { erro };

  const { data: linhaGravada, error } = await db.from("documentos_recebidos").insert({
    empresa_id: empresa, origem, nome_arquivo: arquivo.nome.slice(0, 200), remetente: remetente?.slice(0, 200) ?? null,
    dados, linha_digitavel: linha, erro,
  }).select("id").single();
  if (error) return { erro: error.message };
  return { id: linhaGravada.id };
}
