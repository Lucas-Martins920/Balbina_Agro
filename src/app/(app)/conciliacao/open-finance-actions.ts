"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { buscarContas, buscarItem, buscarTransacoes, criarTokenConexao, openFinanceConfigurado, removerItem, sincronizarConexao } from "@/lib/open-finance";
import { linhaDaTransacao, mesmaConta, saldoInicial, statusDoItem, tipoContaDe } from "@/lib/open-finance-mapa";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/conciliacao");
  revalidatePath("/conciliacao/bancos");
  revalidatePath("/contas");
}

// Toda chamada à Pluggy gasta cota e age em nome da empresa: o RLS só barra depois, na gravação.
async function podeBancos() {
  const { pode } = await getPermissoes();
  return pode("conciliacao.editar") || pode("contas.editar");
}
const SEM_PERMISSAO = "Você não tem permissão para conectar bancos.";

const mensagem = (e: unknown) => (e instanceof Error ? e.message : "Não consegui falar com o banco agora. Tente de novo.");

// Token para abrir o widget da Pluggy. Com itemId, reabre a conexão para renovar o consentimento.
export async function gerarTokenConexao(itemId?: string): Promise<{ token?: string; sandbox?: boolean; erro?: string }> {
  if (!openFinanceConfigurado()) return { erro: "O Open Finance ainda não foi ativado no servidor. Veja as instruções nesta tela." };
  const plano = await foraDoPlano("conciliacao");
  if (plano) return { erro: plano };
  if (!(await podeBancos())) return { erro: SEM_PERMISSAO };
  const { atual } = await getEmpresaAtual();
  if (itemId) {
    const supabase = await createClient();
    const { data } = await supabase.from("conexoes_bancarias").select("id").eq("empresa_id", atual.id).eq("item_id", itemId).maybeSingle();
    if (!data) return { erro: "Conexão não encontrada." };
  }
  try {
    return { token: await criarTokenConexao(atual.id, itemId), sandbox: process.env.PLUGGY_SANDBOX === "1" };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

// Depois do widget: grava a conexão, liga cada conta do banco a uma conta do ERP
// (a já cadastrada com o mesmo número ou uma nova) e traz o extrato do mês.
export async function registrarConexao(itemId: string): Promise<EstadoAcao> {
  const plano = await foraDoPlano("conciliacao");
  if (plano) return falha(plano);
  if (!(await podeBancos())) return falha(SEM_PERMISSAO);
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  try {
    const item = await buscarItem(itemId);
    if (item.clientUserId !== atual.id) return falha("Esta conexão não foi aberta por esta empresa.");
    const instituicao = item.connector?.name ?? "Banco";

    const { data: conexao, error } = await supabase.from("conexoes_bancarias")
      .upsert({ empresa_id: atual.id, provedor: "pluggy", item_id: itemId, instituicao, status: statusDoItem(item.status), erro: null, updated_at: new Date().toISOString() },
        { onConflict: "provedor,item_id" })
      .select("id, empresa_id, item_id, instituicao, ultima_sincronizacao").single();
    if (error) return falha(mensagemBanco(error));

    const { data: nossas } = await supabase.from("contas_financeiras").select("id, conta, conta_dv, open_finance_conta_id")
      .eq("empresa_id", atual.id).eq("arquivada", false);
    const inicioMes = `${hojeISO(atual.fuso).slice(0, 8)}01`;
    let ligadas = 0;
    for (const c of await buscarContas(itemId)) {
      const tipo = tipoContaDe(c);
      if (!tipo) continue;
      if (nossas?.some((n) => n.open_finance_conta_id === c.id)) { ligadas++; continue; }
      const igual = nossas?.find((n) => !n.open_finance_conta_id && mesmaConta(c.number, n.conta, n.conta_dv));
      if (igual) {
        await supabase.from("contas_financeiras").update({ open_finance_item_id: itemId, open_finance_conta_id: c.id, updated_at: new Date().toISOString() }).eq("id", igual.id);
      } else {
        const linhas = (await buscarTransacoes(c.id, inicioMes)).map(linhaDaTransacao).filter((l) => l !== null);
        const { error: e } = await supabase.from("contas_financeiras").insert({
          empresa_id: atual.id, tipo, nome: `${instituicao} ${c.number}`.slice(0, 80), conta: c.number,
          saldo_inicial_cents: saldoInicial(c.balance, linhas), saldo_inicial_data: inicioMes,
          open_finance_item_id: itemId, open_finance_conta_id: c.id,
        });
        if (e) return falha(mensagemBanco(e));
      }
      ligadas++;
    }
    if (!ligadas) return falha(`${instituicao} conectado, mas não achei conta corrente ou poupança para importar.`);

    const r = await sincronizarConexao(supabase, conexao);
    revalidar();
    return sucesso(`${instituicao} conectado: ${ligadas} conta(s), ${r.novas} lançamento(s) trazidos${r.porRegra ? `, ${r.porRegra} ignorado(s) pela regra "Ignorar"` : ""}.`);
  } catch (e) {
    return falha(mensagem(e));
  }
}

export async function sincronizarAgora(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const plano = await foraDoPlano("conciliacao");
  if (plano) return falha(plano);
  if (!(await podeBancos())) return falha(SEM_PERMISSAO);
  const supabase = await createClient();
  const { data: conexao } = await supabase.from("conexoes_bancarias").select("id, empresa_id, item_id, instituicao, ultima_sincronizacao")
    .eq("id", String(form.get("conexao_id") ?? "")).maybeSingle();
  if (!conexao) return falha("Conexão não encontrada.");
  try {
    const r = await sincronizarConexao(supabase, conexao);
    revalidar();
    if (!r.novas) return sucesso("Extrato em dia: nada novo no banco.");
    return sucesso(`${r.novas} lançamento(s) novo(s)${r.porRegra ? `, ${r.porRegra} ignorado(s) pela regra "Ignorar"` : ""}.`);
  } catch (e) {
    revalidar();
    return falha(mensagem(e));
  }
}

// Liga ou desliga uma conta do ERP de uma conta do banco conectado.
export async function desligarConta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await podeBancos())) return falha("Você não tem permissão para desconectar contas do Open Finance.");
  const supabase = await createClient();
  const { error } = await supabase.from("contas_financeiras").update({ open_finance_item_id: null, open_finance_conta_id: null, updated_at: new Date().toISOString() })
    .eq("id", String(form.get("conta_id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("A conta não recebe mais o extrato automático. O que já foi importado continua lá.");
}

export async function desconectarBanco(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  // a conexão é removida na Pluggy antes de gravar aqui, então o RLS sozinho não segura
  if (!(await podeBancos())) return falha("Você não tem permissão para desconectar bancos.");
  const supabase = await createClient();
  const { data: conexao } = await supabase.from("conexoes_bancarias").select("id, item_id").eq("id", String(form.get("conexao_id") ?? "")).maybeSingle();
  if (!conexao) return falha("Conexão não encontrada.");
  try {
    await removerItem(conexao.item_id);
  } catch {
    // já removida na Pluggy: segue desligando aqui
  }
  await supabase.from("contas_financeiras").update({ open_finance_item_id: null, open_finance_conta_id: null }).eq("open_finance_item_id", conexao.item_id);
  const { error } = await supabase.from("conexoes_bancarias").update({ status: "desconectada", updated_at: new Date().toISOString() }).eq("id", conexao.id);
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Banco desconectado. O consentimento foi revogado e o extrato já importado continua no sistema.");
}
