import { after } from "next/server";
import { tokenConfere } from "@/lib/asaas-mapa";
import { receberDocumento, tipoAceito } from "@/lib/documento-recebido";
import { hojeISO } from "@/lib/formato";
import { TAMANHO_MAXIMO } from "@/lib/ia";
import { lerXmlNfe } from "@/lib/nfe-xml";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarMidia, enviarTexto, whatsappConfigurado } from "@/lib/whatsapp";
import { AJUDA, assinaturaConfere, comandoDoTexto, lerWebhook, type MensagemRecebida } from "@/lib/whatsapp-texto";

export const maxDuration = 60;

// H2: webhook do WhatsApp do Balbina (Meta Cloud API). Cadastro no app da Meta: URL
// https://<site>/api/entrada/whatsapp, token de verificação = WHATSAPP_VERIFICACAO, campo "messages".

// A Meta confere a URL com GET antes de ligar o webhook.
export function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && tokenConfere(p.get("hub.verify_token"), process.env.WHATSAPP_VERIFICACAO)) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("não autorizado", { status: 403 });
}

// Responde 200 na hora (a Meta reenvia o que demora) e trata as mensagens depois.
export async function POST(request: Request) {
  const corpo = await request.text();
  if (!assinaturaConfere(corpo, request.headers.get("x-hub-signature-256"), process.env.WHATSAPP_SEGREDO_APP)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return Response.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const mensagens = lerWebhook(json);
  if (mensagens.length && whatsappConfigurado()) {
    after(async () => {
      for (const m of mensagens.slice(0, 10)) {
        try {
          await tratar(m);
        } catch (e) {
          console.error("mensagem do WhatsApp", m.id, e);
        }
      }
    });
  }
  return Response.json({ ok: true });
}

type Remetente = { empresa_id: string; user_id: string; empresa: string; pode_documentos: boolean };

async function tratar(m: MensagemRecebida) {
  const db = createAdminClient();
  const { data: nova } = await db.from("whatsapp_mensagens").upsert({ id: m.id }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  if (!nova?.length) return; // já tratada

  const responder = (texto: string) => enviarTexto(m.de, texto);
  const comando = m.tipo === "texto" ? comandoDoTexto(m.texto ?? "") : null;

  if (comando?.tipo === "vincular") {
    const { data } = await db.rpc("whatsapp_confirmar", { p_de: m.de, p_codigo: comando.codigo });
    const ligado = data as { empresa: string } | null;
    await responder(ligado
      ? `Pronto! Este celular está ligado ao Balbina da ${ligado.empresa}. Os avisos que você recebe no Balbina chegam aqui também. ${AJUDA}`
      : "Código não confere ou já venceu. Peça um novo em Configurações › Automações › WhatsApp e mande deste mesmo celular.");
    return;
  }

  const { data: quem } = await db.rpc("whatsapp_remetente", { p_de: m.de });
  const r = ((quem ?? []) as Remetente[])[0];
  if (!r) {
    await responder("Este é o número de avisos do Balbina. Para falar com a piscicultura, use o contato de costume. " +
      "Se você usa o Balbina, ligue este celular em Configurações › Automações › WhatsApp.");
    return;
  }

  if (comando?.tipo === "sair" || comando?.tipo === "voltar") {
    await db.rpc("whatsapp_avisos_por_numero", { p_de: m.de, p_ligar: comando.tipo === "voltar" });
    await responder(comando.tipo === "sair"
      ? "Avisos desligados neste celular. Documentos mandados aqui continuam entrando. Para voltar, mande VOLTAR."
      : "Avisos ligados de novo.");
    return;
  }
  if (m.tipo === "audio") {
    await responder("Áudio ainda não. Para lançar o apontamento falando, use o botão \"Falar o apontamento\" no app de campo.");
    return;
  }
  if (!m.midia) {
    await responder(AJUDA);
    return;
  }
  if (!r.pode_documentos) {
    await responder("Seu usuário não lança contas a pagar na empresa, então o documento não entrou. Peça ao responsável.");
    return;
  }

  const arquivo = await baixarMidia(m.midia.id, TAMANHO_MAXIMO);
  if ("erro" in arquivo) {
    await responder(`Não deu para receber: ${arquivo.erro}. Mande uma foto ou um PDF de até 4 MB.`);
    return;
  }
  const nome = m.midia.nome;
  if (arquivo.tipo.includes("xml") || nome.toLowerCase().endsWith(".xml")) {
    const nota = lerXmlNfe(Buffer.from(arquivo.base64, "base64").toString("utf8"));
    if (!nota) {
      await responder("Esse XML não parece uma NF-e autorizada.");
      return;
    }
    const { data: novas } = await db.rpc("registrar_nfes_recebidas", { p_empresa: r.empresa_id, p_notas: [nota], p_versao: 0 });
    await responder(Number(novas) ? `Nota de ${nota.nome_emitente} recebida. Confira em Notas fiscais › Notas de compra.` : "Essa nota já estava no Balbina.");
    return;
  }
  if (!tipoAceito(arquivo.tipo)) {
    await responder("Mande PDF ou foto (JPG, PNG ou WebP) do boleto, nota ou recibo.");
    return;
  }
  const { data: empresa } = await db.from("empresas").select("fuso").eq("id", r.empresa_id).single();
  const res = await receberDocumento(db, r.empresa_id, { base64: arquivo.base64, tipo: arquivo.tipo, nome, tamanho: arquivo.tamanho },
    "whatsapp", hojeISO(empresa?.fuso), `WhatsApp ${m.de}`);
  await responder(res.id
    ? "Recebido. Confira e lance em Contas a pagar › Boletos e notas por foto."
    : `Não entrou: ${res.erro ?? "erro ao gravar"}.`);
}
