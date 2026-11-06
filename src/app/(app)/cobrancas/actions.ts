"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { asaas, credencialDoPerfil } from "@/lib/asaas";
import { idAsaas, MEIOS_COBRANCA, type Meio } from "@/lib/asaas-mapa";
import { emitirCobrancaTitulo } from "@/lib/cobranca";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerDecimal } from "@/lib/formato";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/cobrancas");
  revalidatePath("/contas-a-receber");
  revalidatePath("/vendas", "layout");
}

export async function salvarPerfil(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  let conta = String(form.get("conta_repasse_id") ?? "");
  if (conta === "nova") {
    const { data, error } = await supabase.from("contas_financeiras").insert({ empresa_id: atual.id, tipo: "corrente", nome: "Asaas", banco_codigo: "461" }).select("id").single();
    if (error) return falha(mensagemBanco(error));
    conta = data.id;
  }
  if (!conta) return falha("Escolha a conta onde o dinheiro das cobranças cai.");
  const campos = {
    conta_repasse_id: conta,
    juros_mes_percentual: lerDecimal(form.get("juros")) ?? 1,
    multa_percentual: lerDecimal(form.get("multa")) ?? 2,
    desconto_ate_vencimento_percentual: lerDecimal(form.get("desconto")) ?? 0,
  };
  const id = String(form.get("perfil_id") ?? "");
  const { error } = id
    ? await supabase.from("perfis_cobranca").update(campos).eq("id", id)
    : await supabase.from("perfis_cobranca").insert({ empresa_id: atual.id, nome: "Asaas", provedor: "asaas", ...campos });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Perfil de cobrança salvo.");
}

export async function emitirCobranca(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const meio = String(form.get("meio") ?? "boleto_pix") as Meio;
  if (!(meio in MEIOS_COBRANCA)) return falha("Meio de cobrança inválido.");
  const plano = await foraDoPlano("cobrancas");
  if (plano) return falha(plano);
  const supabase = await createClient();
  const erro = await emitirCobrancaTitulo(supabase, String(form.get("agendamento_id") ?? ""), String(form.get("perfil_id") ?? ""), meio);
  revalidar();
  if (erro) return falha(erro);
  return sucesso("Cobrança emitida. O Asaas envia ao cliente por e-mail; o link também fica aqui.");
}

export async function cancelarCobranca(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  // o pagamento é apagado no Asaas antes de gravar aqui, então o RLS sozinho não segura
  const plano = await foraDoPlano("cobrancas");
  if (plano) return falha(plano);
  if (!(await getPermissoes()).pode("cobrancas.emitir")) return falha("Você não tem permissão para cancelar cobranças.");
  const supabase = await createClient();
  const { data: c } = await supabase.from("cobrancas").select("id, id_externo, status, perfis_cobranca(id)").eq("id", String(form.get("cobranca_id") ?? "")).single();
  if (!c) return falha("Cobrança não encontrada.");
  if (c.status === "paga") return falha("Cobrança já paga não pode ser cancelada.");
  try {
    if (c.id_externo) {
      // só apaga se o pagamento for mesmo desta cobrança (o id pode ter sido editado pela API)
      // o perfil vem pela RLS (só os da empresa), nunca só pelo id gravado na cobrança
      const perfil = c.perfis_cobranca as unknown as { id: string } | null;
      if (!perfil) return falha("Perfil de cobrança não encontrado.");
      const cred = await credencialDoPerfil(perfil);
      const id = idAsaas(c.id_externo, "pay");
      const pagamento = id ? await asaas<{ externalReference?: string }>(cred, `/payments/${id}`) : null;
      if (pagamento?.externalReference !== c.id) return falha("O pagamento no Asaas não corresponde a esta cobrança.");
      await asaas(cred, `/payments/${id}`, { method: "DELETE" });
    }
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao cancelar no Asaas");
  }
  const { error } = await supabase.from("cobrancas").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", c.id);
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Cobrança cancelada.");
}
