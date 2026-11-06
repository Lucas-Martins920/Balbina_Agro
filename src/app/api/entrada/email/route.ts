import { tokenConfere } from "@/lib/asaas-mapa";
import { receberDocumento, tipoAceito } from "@/lib/documento-recebido";
import { hojeISO } from "@/lib/formato";
import { lerXmlNfe } from "@/lib/nfe-xml";
import { avisarEmpresa } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

type Anexo = { Name?: string; Content?: string; ContentType?: string; ContentLength?: number };
type EmailRecebido = {
  From?: string; MailboxHash?: string; To?: string; OriginalRecipient?: string; Subject?: string; Attachments?: Anexo[];
};
const MAX_ANEXOS = 10;

// C4: caixa de entrada por e-mail. O provedor de e-mail de entrada (formato Postmark Inbound) chama esta
// rota com "Authorization: Basic" (senha = ENTRADA_EMAIL_SEGREDO) ou ?segredo=. A empresa vem do token
// depois do + no endereço (notas+TOKEN@...). XML de NF-e vai para as notas de compra; PDF e foto passam
// pela leitura por IA e caem em Boletos e notas por foto. Responde 200 mesmo sem anexo útil, para o
// provedor não ficar reenviando.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const basico = request.headers.get("authorization")?.match(/^Basic (.+)$/)?.[1];
  const senha = basico ? Buffer.from(basico, "base64").toString().split(":").slice(1).join(":") : url.searchParams.get("segredo");
  if (!tokenConfere(senha, process.env.ENTRADA_EMAIL_SEGREDO)) return Response.json({ erro: "não autorizado" }, { status: 401 });

  let email: EmailRecebido;
  try {
    email = await request.json();
  } catch {
    return Response.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const token = email.MailboxHash || /\+([a-z0-9]+)@/i.exec(email.OriginalRecipient ?? email.To ?? "")?.[1] || "";
  const db = createAdminClient();
  const { data: empresa } = await db.rpc("empresa_da_entrada", { p_token: token.toLowerCase() });
  if (!empresa) return Response.json({ ok: true, ignorado: "endereço desconhecido" });
  const { data: dadosEmpresa } = await db.from("empresas").select("fuso").eq("id", empresa).single();
  const hoje = hojeISO(dadosEmpresa?.fuso);

  const notas = [];
  let documentos = 0;
  for (const a of (email.Attachments ?? []).slice(0, MAX_ANEXOS)) {
    if (!a.Content) continue;
    const nome = a.Name ?? "anexo";
    const tipo = (a.ContentType ?? "").toLowerCase();
    if (tipo.includes("xml") || nome.toLowerCase().endsWith(".xml")) {
      const nota = lerXmlNfe(Buffer.from(a.Content, "base64").toString("utf8"));
      if (nota) notas.push(nota);
    } else if (tipoAceito(tipo)) {
      const r = await receberDocumento(db, empresa, { base64: a.Content, tipo, nome, tamanho: a.ContentLength ?? a.Content.length * 0.75 },
        "email", hoje, email.From);
      if (r.id) documentos++;
    }
  }
  let novas = 0;
  if (notas.length) {
    const { data } = await db.rpc("registrar_nfes_recebidas", { p_empresa: empresa, p_notas: notas, p_versao: 0 });
    novas = Number(data ?? 0);
  }
  if (novas + documentos > 0) {
    const partes = [novas ? `${novas} nota(s) de compra` : "", documentos ? `${documentos} documento(s) para conferir` : ""].filter(Boolean);
    await avisarEmpresa(db, empresa, {
      titulo: "Chegou por e-mail", texto: `${partes.join(" e ")}${email.Subject ? ` (${email.Subject.slice(0, 60)})` : ""}.`,
      link: documentos ? "/contas-a-pagar/documentos" : "/notas/recebidas", tag: "entrada-email",
    }, "contas-a-pagar.editar");
  }
  return Response.json({ ok: true, notas: novas, documentos });
}
