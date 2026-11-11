"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { focusEmpresas } from "@/lib/focus";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerCentavos } from "@/lib/formato";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Grava uma parte da configuração das automações (cada cartão manda os seus campos).
async function gravar(campos: Record<string, unknown>, mensagem: string): Promise<EstadoAcao> {
  const { pode } = await getPermissoes();
  if (!pode("configuracoes.editar")) return falha("Seu usuário não pode alterar as configurações da empresa.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("automacoes_empresa")
    .upsert({ empresa_id: atual.id, ...campos, updated_at: new Date().toISOString() }, { onConflict: "empresa_id" });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/configuracoes/automacoes");
  return sucesso(mensagem);
}

export async function salvarLembreteApontamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ligar = form.get("lembrete_apontamento") === "on";
  const manha = String(form.get("lembrete_manha") ?? "");
  const tarde = String(form.get("lembrete_tarde") ?? "");
  if (!HORA.test(manha) || !HORA.test(tarde)) return falha("Informe os horários no formato 10:00.");
  if (manha >= tarde) return falha("O lembrete da manhã tem de ser antes do da tarde.");
  return gravar({ lembrete_apontamento: ligar, lembrete_manha: manha, lembrete_tarde: tarde },
    ligar ? `Lembrete ligado: ${manha} (manhã) e ${tarde} (tarde).` : "Lembrete de apontamento desligado.");
}

export async function salvarAbastecimento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const compra = Number(form.get("compra_dias"));
  if (!Number.isInteger(compra) || compra < 1 || compra > 180) return falha("Dias de compra: de 1 a 180.");
  revalidatePath("/previsoes");
  return gravar({ compra_dias: compra }, `Compra de ração para ${compra} dias.`);
}

const dia = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
};

export async function salvarAvisosRotina(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const hora = String(form.get("resumo_hora") ?? "");
  if (!HORA.test(hora)) return falha("Informe a hora do resumo no formato 06:30.");
  const pacoteDia = dia(form.get("pacote_contador_dia"));
  if (!pacoteDia) return falha("Os dias do mês vão de 1 a 28.");
  return gravar({
    resumo_diario: form.get("resumo_diario") === "on", resumo_hora: hora,
    pacote_contador: form.get("pacote_contador") === "on", pacote_contador_dia: pacoteDia,
  }, "Avisos de rotina salvos.");
}

// B1: liga ou desliga a busca de NF-e de compra na SEFAZ. Liga também a manifestação no cadastro do
// emitente na Focus (cobrada por nota recebida pela Focus).
export async function salvarBuscaNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ligar = form.get("mde_ligado") === "on";
  if (!(await getPermissoes()).pode("configuracoes.editar")) return falha("Seu usuário não pode alterar as configurações da empresa.");
  if (ligar) {
    const plano = await foraDoPlano("notas");
    if (plano) return falha(plano);
  }
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: emitente } = await supabase.from("focus_emitentes").select("focus_id").eq("empresa_id", atual.id).maybeSingle();
  if (ligar && !emitente) return falha("Cadastre antes a piscicultura como emitente na Focus NFe, em Notas fiscais (o certificado A1 é o mesmo).");
  if (emitente) {
    try {
      const { status, dados } = await focusEmpresas<{ mensagem?: string }>(`/v2/empresas/${encodeURIComponent(emitente.focus_id)}`,
        { method: "PUT", body: { habilita_manifestacao: ligar } });
      if (status >= 400) return falha(`A Focus recusou: ${dados.mensagem ?? status}`);
    } catch (e) {
      if (ligar) return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe.");
    }
  }
  return gravar({ mde_ligado: ligar }, ligar ? "Busca de notas de compra ligada. A primeira busca sai na próxima hora." : "Busca de notas de compra desligada.");
}

// D1, D2 e D4: faturar num toque, hora dos pedidos fixos e trava de venda a prazo para quem está devendo.
export async function salvarVendas(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const hora = String(form.get("pedidos_fixos_hora") ?? "");
  if (!HORA.test(hora)) return falha("Informe a hora dos pedidos fixos no formato 16:00.");
  const dias = Number(form.get("inadimplencia_dias"));
  if (!Number.isInteger(dias) || dias < 1 || dias > 180) return falha("Dias de atraso: de 1 a 180.");
  return gravar({
    faturamento_completo: form.get("faturamento_completo") === "on",
    bloquear_prazo_inadimplente: form.get("bloquear_prazo_inadimplente") === "on",
    inadimplencia_dias: dias, pedidos_fixos_hora: hora,
  }, "Automações de vendas salvas.");
}

// C3/C4: limite mensal de leituras por IA (custo) e o endereço de e-mail de entrada da empresa.
export async function salvarLeituraIa(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const limite = Number(form.get("ia_limite_mes"));
  if (!Number.isInteger(limite) || limite < 0 || limite > 5000) return falha("Limite de leituras: de 0 a 5000 por mês.");
  return gravar({ ia_limite_mes: limite }, limite ? `Até ${limite} leituras por IA por mês.` : "Leitura por IA desligada (limite 0).");
}

// Limite mensal de perguntas ao chat do app de campo (custo da IA), separado do das leituras.
export async function salvarChatIa(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const limite = Number(form.get("ia_chat_limite_mes"));
  if (!Number.isInteger(limite) || limite < 0 || limite > 5000) return falha("Limite do chat: de 0 a 5000 perguntas por mês.");
  return gravar({ ia_chat_limite_mes: limite }, limite ? `Até ${limite} perguntas ao chat por mês.` : "Chat com IA desligado (limite 0): o celular responde pela base de manejo.");
}

export async function novoEnderecoEntrada(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const trocar = form.get("trocar") === "1";
  const token = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join("");
  return gravar(trocar ? { entrada_token: token } : {}, trocar ? "Endereço trocado. O antigo para de funcionar." : "Endereço criado.");
}

// H2/D4: régua de cobrança automática pelo WhatsApp do Balbina.
export async function salvarCobrancaWhatsApp(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const hora = String(form.get("whatsapp_cobranca_hora") ?? "");
  if (!HORA.test(hora)) return falha("Informe a hora no formato 09:00.");
  const ligar = form.get("whatsapp_cobranca") === "on";
  if (ligar) {
    const plano = await foraDoPlano("contas-a-receber");
    if (plano) return falha(plano);
  }
  return gravar({ whatsapp_cobranca: ligar, whatsapp_cobranca_hora: hora },
    ligar ? `Lembretes de cobrança pelo WhatsApp a partir das ${hora}.` : "Lembretes de cobrança pelo WhatsApp desligados.");
}

// C7: pagamentos pelo sistema (só o master; o banco também barra).
export async function salvarPagamentos(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { master } = await getPermissoes();
  if (!master) return falha("Só o usuário master muda os pagamentos pelo sistema.");
  const limite = lerCentavos(form.get("pagamento_limite_dia"));
  if (limite === null || limite < 0) return falha("Informe o limite por dia em reais (0 trava tudo).");
  return gravar({
    pagamentos_ligado: form.get("pagamentos_ligado") === "on",
    pagamento_limite_dia_cents: limite,
    pagamento_aprovacao_unica: form.get("pagamento_aprovacao_unica") === "on",
  }, form.get("pagamentos_ligado") === "on" ? "Pagamentos pelo sistema ligados." : "Pagamentos pelo sistema desligados.");
}
