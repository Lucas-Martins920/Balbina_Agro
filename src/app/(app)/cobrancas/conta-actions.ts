"use server";

import { revalidatePath } from "next/cache";
import { falha, sucesso, type EstadoAcao } from "@/lib/acao";
import { asaas, credencialDoPerfil, type Credencial } from "@/lib/asaas";
import { ambienteDaChave, montarSubconta, montarWebhook, type SituacaoConta } from "@/lib/asaas-mapa";
import { credencialBalbina, balbinaAsaasConfigurado } from "@/lib/assinatura";
import { getUsuario } from "@/lib/auth";
import { cifrar, hashToken, novoToken } from "@/lib/cripto";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos } from "@/lib/formato";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Perfil = { id: string; empresa_id: string };

// Ligar uma conta Asaas mexe no destino do dinheiro da piscicultura: só o master, e só no perfil da empresa atual.
async function contexto(form: FormData) {
  if (!process.env.BALBINA_CHAVE_CRIPTO || !process.env.SUPABASE_SECRET_KEY) {
    return { erro: "Falta configurar BALBINA_CHAVE_CRIPTO e SUPABASE_SECRET_KEY no servidor." } as const;
  }
  if (!process.env.NEXT_PUBLIC_SITE_URL) return { erro: "Falta configurar NEXT_PUBLIC_SITE_URL no servidor." } as const;
  const [usuario, { atual }, { master }] = await Promise.all([getUsuario(), getEmpresaAtual(), getPermissoes()]);
  if (!master) return { erro: "Só o usuário master da empresa pode ligar a conta Asaas." } as const;
  const plano = await foraDoPlano("cobrancas");
  if (plano) return { erro: plano } as const;
  const supabase = await createClient();
  const { data: perfil } = await supabase.from("perfis_cobranca").select("id, empresa_id")
    .eq("id", String(form.get("perfil_id") ?? "")).eq("empresa_id", atual.id).maybeSingle<Perfil>();
  if (!perfil) return { erro: "Salve a configuração da cobrança antes de ligar a conta." } as const;
  return { usuario, perfil, empresa: atual.id, db: createAdminClient() } as const;
}

async function situacaoNoAsaas(cred: Credencial) {
  const s = await asaas<{ id?: string; general?: SituacaoConta }>(cred, "/myAccount/status/");
  return { id: s.id ?? null, situacao: s.general ?? "PENDING" };
}

// Cadastra o webhook na conta da piscicultura, com um token só dela (guardamos só o hash).
async function configurarAviso(db: ReturnType<typeof createAdminClient>, perfil: string, cred: Credencial, email: string) {
  const token = novoToken();
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/asaas?perfil=${perfil}`;
  await asaas(cred, "/webhooks", { method: "POST", body: montarWebhook({ url, email, token }) });
  await db.from("contas_asaas_segredos").update({ webhook_token_sha256: hashToken(token) }).eq("perfil_cobranca_id", perfil);
}

// Grava conta e chave cifrada e esquece os clientes cadastrados na conta anterior.
async function gravarConta(
  ctx: { perfil: Perfil; empresa: string; db: ReturnType<typeof createAdminClient> },
  cred: Credencial, conta: { modo: "subconta" | "propria"; conta_id: string | null; wallet_id: string | null; email: string | null; situacao: SituacaoConta },
) {
  const { db, perfil, empresa } = ctx;
  const { error } = await db.from("contas_asaas").upsert({
    perfil_cobranca_id: perfil.id, empresa_id: empresa, ambiente: cred.ambiente === "producao" ? "producao" : "sandbox", ...conta, updated_at: new Date().toISOString(),
  });
  if (error) return error.message;
  const { error: e2 } = await db.from("contas_asaas_segredos").upsert({
    perfil_cobranca_id: perfil.id, chave_cifrada: cifrar(cred.chave), webhook_token_sha256: hashToken(novoToken()),
  });
  if (e2) return e2.message;
  await db.from("contatos").update({ asaas_cliente_id: null }).eq("empresa_id", empresa);
  return null;
}

export async function abrirSubconta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ctx = await contexto(form);
  if ("erro" in ctx) return falha(ctx.erro!);
  if (!balbinaAsaasConfigurado()) return falha("A conta Asaas do Balbina ainda não está configurada (BALBINA_ASAAS_API_KEY).");
  const { data: empresa } = await (await createClient()).from("empresas").select("cnpj, razao_social").eq("id", ctx.empresa).single();
  const t = (k: string) => String(form.get(k) ?? "");
  const r = montarSubconta({
    nome: empresa!.razao_social, documento: empresa!.cnpj, email: t("email"), celular: t("celular"), faturamento_cents: lerCentavos(form.get("faturamento")),
    cep: t("cep"), endereco: t("endereco"), numero: t("numero"), complemento: t("complemento"), bairro: t("bairro"), tipo_empresa: t("tipo_empresa"), nascimento: t("nascimento"),
  });
  if ("erro" in r) return falha(r.erro);

  let criada: { id?: string; apiKey?: string; walletId?: string };
  try {
    criada = await asaas(credencialBalbina(), "/accounts", { method: "POST", body: r.corpo });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao abrir a conta no Asaas");
  }
  if (!criada.apiKey) return falha("O Asaas abriu a conta mas não devolveu a chave. Fale com o suporte do Balbina antes de tentar de novo.");
  // a chave só vem nesta resposta: grava antes de qualquer outra chamada
  const cred: Credencial = { chave: criada.apiKey, ambiente: credencialBalbina().ambiente };
  const email = String(r.corpo.email);
  const erro = await gravarConta(ctx, cred, { modo: "subconta", conta_id: criada.id ?? null, wallet_id: criada.walletId ?? null, email, situacao: "PENDING" });
  if (erro) return falha(`Conta aberta no Asaas, mas não foi gravada aqui (${erro}). Fale com o suporte do Balbina.`);

  let aviso = "";
  try {
    await configurarAviso(ctx.db, ctx.perfil.id, cred, ctx.usuario.email || email);
  } catch {
    aviso = " O aviso automático de pagamento não foi configurado; use Reconfigurar aviso.";
  }
  revalidatePath("/cobrancas");
  return sucesso(`Conta aberta. O Asaas mandou um e-mail para ${email}: crie a senha e envie os documentos para liberar as cobranças.${aviso}`);
}

export async function conectarContaPropria(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ctx = await contexto(form);
  if ("erro" in ctx) return falha(ctx.erro!);
  const chave = String(form.get("chave") ?? "").trim();
  if (!chave.startsWith("$aact_")) return falha("Cole a chave da API do Asaas (começa com $aact_). Ela fica em Integrações > Chaves de API.");

  // a mesma chave só funciona num ambiente: as novas dizem qual no prefixo, as antigas são testadas nos dois
  const daChave = ambienteDaChave(chave);
  let cred: Credencial | null = null;
  let status: { id: string | null; situacao: SituacaoConta } | null = null;
  let motivo = "";
  for (const ambiente of daChave ? [daChave] : ["producao", "sandbox"]) {
    try {
      status = await situacaoNoAsaas({ chave, ambiente });
      cred = { chave, ambiente };
      break;
    } catch (e) {
      motivo = e instanceof Error ? e.message : "";
    }
  }
  if (!cred || !status) return falha(`O Asaas não aceitou esta chave. Confira se copiou a chave inteira.${motivo ? ` (${motivo})` : ""}`);
  const erro = await gravarConta(ctx, cred, { modo: "propria", conta_id: status.id, wallet_id: null, email: null, situacao: status.situacao });
  if (erro) return falha(erro);
  try {
    await configurarAviso(ctx.db, ctx.perfil.id, cred, ctx.usuario.email);
  } catch (e) {
    revalidatePath("/cobrancas");
    return falha(`Conta ligada, mas o aviso automático não foi configurado: ${e instanceof Error ? e.message : ""}`);
  }
  revalidatePath("/cobrancas");
  return sucesso(`Conta Asaas ligada (${cred.ambiente === "producao" ? "produção" : "sandbox"}). Os pagamentos baixam sozinhos aqui.`);
}

export async function atualizarConta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ctx = await contexto(form);
  if ("erro" in ctx) return falha(ctx.erro!);
  try {
    const cred = await credencialDoPerfil(ctx.perfil);
    const { situacao } = await situacaoNoAsaas(cred);
    await ctx.db.from("contas_asaas").update({ situacao, updated_at: new Date().toISOString() }).eq("perfil_cobranca_id", ctx.perfil.id);
    if (form.get("aviso") === "1") await configurarAviso(ctx.db, ctx.perfil.id, cred, ctx.usuario.email);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com o Asaas");
  }
  revalidatePath("/cobrancas");
  return sucesso(form.get("aviso") === "1" ? "Aviso automático configurado de novo." : "Situação atualizada.");
}

export async function desligarConta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ctx = await contexto(form);
  if ("erro" in ctx) return falha(ctx.erro!);
  const { error } = await ctx.db.from("contas_asaas").delete().eq("perfil_cobranca_id", ctx.perfil.id);
  if (error) return falha(error.message);
  revalidatePath("/cobrancas");
  return sucesso("Conta desligada do Balbina. Ela continua existindo no Asaas.");
}
