"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { ESCOPOS_VALIDOS, EVENTOS_VALIDOS, gerarSegredoWebhook, gerarToken, prefixoToken, validarUrlWebhook } from "@/lib/api/regras";
import { cifrar, hashToken } from "@/lib/cripto";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// Ação que devolve um segredo para mostrar uma vez só (token da chave ou segredo do webhook).
export type EstadoSegredo = EstadoAcao & { segredo?: string };

const CAMINHO = "/configuracoes/api";

export async function criarChave(_: EstadoSegredo, form: FormData): Promise<EstadoSegredo> {
  const nome = String(form.get("nome") ?? "").trim();
  const escopos = form.getAll("escopos").map(String).filter((e) => ESCOPOS_VALIDOS.has(e));
  if (!nome) return falha("Dê um nome à chave (por exemplo, o sistema que vai usar).");
  if (escopos.length === 0) return falha("Marque ao menos um escopo.");

  const token = gerarToken();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_chave_api", {
    p_empresa: atual.id, p_nome: nome, p_escopos: escopos, p_hash: hashToken(token), p_prefixo: prefixoToken(token),
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath(CAMINHO);
  return { ...sucesso(`Chave "${nome}" criada, válida por 7 dias. Copie agora: ela não aparece de novo.`), segredo: token };
}

export async function revogarChave(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revogar_chave_api", { p_chave: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidatePath(CAMINHO);
  return sucesso("Chave revogada. Quem usava recebe erro 401 a partir de agora.");
}

export async function criarWebhook(_: EstadoSegredo, form: FormData): Promise<EstadoSegredo> {
  const url = String(form.get("url") ?? "").trim();
  const eventos = form.getAll("eventos").map(String).filter((e) => EVENTOS_VALIDOS.has(e));
  const erroUrl = validarUrlWebhook(url);
  if (erroUrl) return falha(erroUrl);
  if (eventos.length === 0) return falha("Marque ao menos um evento.");

  const segredo = gerarSegredoWebhook();
  let cifrado: string;
  try {
    cifrado = cifrar(segredo);
  } catch {
    return falha("O servidor está sem BALBINA_CHAVE_CRIPTO; peça ao suporte do Balbina.");
  }
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_webhook_api", { p_empresa: atual.id, p_url: url, p_eventos: eventos, p_segredo_cifrado: cifrado });
  if (error) return falha(mensagemBanco(error));
  revalidatePath(CAMINHO);
  return { ...sucesso("Webhook cadastrado. Guarde o segredo para conferir a assinatura dos avisos: ele não aparece de novo."), segredo };
}

export async function alterarWebhook(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const acao = String(form.get("acao") ?? "");
  if (!["ligar", "desligar", "excluir"].includes(acao)) return falha("Ação inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("alterar_webhook_api", {
    p_webhook: String(form.get("id") ?? ""), p_ativo: acao === "ligar", p_excluir: acao === "excluir",
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath(CAMINHO);
  return sucesso(acao === "excluir" ? "Webhook excluído." : acao === "ligar" ? "Webhook ligado." : "Webhook desligado.");
}
