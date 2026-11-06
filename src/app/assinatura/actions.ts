"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { falha, sucesso, type EstadoAcao } from "@/lib/acao";
import { balbinaAsaas, getAssinatura } from "@/lib/assinatura";
import { montarAssinatura, primeiroVencimento, type Plano } from "@/lib/assinatura-mapa";
import { getUsuario } from "@/lib/auth";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Linha = { status: string; teste_ate: string | null; asaas_cliente_id: string | null; asaas_assinatura_id: string | null };

// O usuário só lê a assinatura; quem grava é o servidor, depois de conferir que ele é master da empresa.
async function exigirMasterDaEmpresa() {
  const usuario = await getUsuario();
  const { atual } = await getEmpresaAtual();
  const { master } = await getPermissoes();
  return master ? { usuario, empresa: atual.id } : null;
}

export async function assinar(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ctx = await exigirMasterDaEmpresa();
  if (!ctx) return falha("Só o usuário master da empresa pode assinar.");
  const supabase = await createClient();
  const [{ data: plano }, { data: empresa }] = await Promise.all([
    supabase.from("planos").select("id, nome, descricao, valor_cents, ciclo").eq("id", String(form.get("plano") ?? "")).maybeSingle<Plano>(),
    supabase.from("empresas").select("cnpj, razao_social").eq("id", ctx.empresa).single(),
  ]);
  if (!plano || !empresa) return falha("Plano não encontrado.");

  const db = createAdminClient();
  const { data: atual } = await db.from("assinaturas").select("status, teste_ate, asaas_cliente_id, asaas_assinatura_id").eq("empresa_id", ctx.empresa).single<Linha>();
  if (!atual) return falha("Assinatura da empresa não encontrada.");

  let fatura: string | null = null;
  try {
    let cliente = atual.asaas_cliente_id;
    // tentativa anterior pode ter criado o cliente e caído antes de gravar: procura pela empresa antes de criar outro
    if (!cliente) {
      const achados = await balbinaAsaas<{ data?: { id: string }[] }>(`/customers?externalReference=${ctx.empresa}&limit=1`);
      cliente = achados.data?.[0]?.id ?? null;
    }
    if (!cliente) {
      cliente = (await balbinaAsaas<{ id: string }>("/customers", {
        method: "POST",
        body: { name: empresa.razao_social, cpfCnpj: empresa.cnpj, email: ctx.usuario.email, externalReference: ctx.empresa, notificationDisabled: false },
      })).id;
    }
    if (cliente !== atual.asaas_cliente_id) await db.from("assinaturas").update({ asaas_cliente_id: cliente }).eq("empresa_id", ctx.empresa);
    const hoje = hojeISO("America/Sao_Paulo");
    const corpo = montarAssinatura({ cliente, empresaId: ctx.empresa, plano, vencimento: primeiroVencimento(hoje, atual.teste_ate) });
    // assinatura ativa no Asaas que não foi gravada aqui (clique duplo, queda): reaproveita em vez de cobrar duas vezes
    let existente = atual.status !== "cancelada" ? atual.asaas_assinatura_id : null;
    if (!existente) {
      const ativas = await balbinaAsaas<{ data?: { id: string; externalReference?: string }[] }>(`/subscriptions?customer=${cliente}&status=ACTIVE&limit=10`);
      existente = ativas.data?.find((a) => a.externalReference === ctx.empresa)?.id ?? null;
    }
    // troca de plano: atualiza a assinatura existente e as cobranças em aberto
    const assinatura = existente
      ? await balbinaAsaas<{ id: string }>(`/subscriptions/${existente}`, {
          method: "POST", body: { value: corpo.value, cycle: corpo.cycle, description: corpo.description, updatePendingPayments: true },
        })
      : await balbinaAsaas<{ id: string }>("/subscriptions", { method: "POST", body: corpo });

    const pendentes = await balbinaAsaas<{ data?: { invoiceUrl?: string }[] }>(`/subscriptions/${assinatura.id}/payments?status=PENDING`).catch(() => null);
    fatura = pendentes?.data?.[0]?.invoiceUrl ?? null;
    const status = ["ativa", "cortesia"].includes(atual.status) ? atual.status : atual.teste_ate && atual.teste_ate >= hoje ? "teste" : "aguardando";
    const { error } = await db.from("assinaturas").update({
      plano_id: plano.id, asaas_assinatura_id: assinatura.id, status, fatura_url: fatura, updated_at: new Date().toISOString(),
    }).eq("empresa_id", ctx.empresa);
    if (error) return falha("A assinatura foi criada no Asaas, mas não foi gravada aqui. Tente de novo em instantes.");
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com o Asaas");
  }
  revalidatePath("/", "layout");
  const { liberada } = await getAssinatura(ctx.empresa);
  // sem acesso, vai direto para a fatura (Pix, boleto ou cartão no Asaas)
  if (fatura && !liberada) redirect(fatura);
  return sucesso(`Plano ${plano.nome} assinado.${fatura ? " A fatura já está disponível no botão Pagar." : ""}`);
}

export async function cancelarAssinatura(): Promise<EstadoAcao> {
  const ctx = await exigirMasterDaEmpresa();
  if (!ctx) return falha("Só o usuário master da empresa pode cancelar.");
  const db = createAdminClient();
  const { data: atual } = await db.from("assinaturas").select("asaas_assinatura_id").eq("empresa_id", ctx.empresa).single();
  if (!atual?.asaas_assinatura_id) return falha("Não há assinatura para cancelar.");
  try {
    await balbinaAsaas(`/subscriptions/${atual.asaas_assinatura_id}`, { method: "DELETE" });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com o Asaas");
  }
  await db.from("assinaturas").update({ status: "cancelada", fatura_url: null, updated_at: new Date().toISOString() }).eq("empresa_id", ctx.empresa);
  revalidatePath("/", "layout");
  return sucesso("Assinatura cancelada. O acesso continua até o fim do período já pago.");
}
