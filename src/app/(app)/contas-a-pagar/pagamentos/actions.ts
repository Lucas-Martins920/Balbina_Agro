"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { AsaasErro, credencialDoPerfil } from "@/lib/asaas";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { pagarBoleto } from "@/lib/pagamentos-asaas";
import { createClient } from "@/lib/supabase/server";

const ids = (form: FormData, campo: string) => form.getAll(campo).map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));

function atualizar() {
  revalidatePath("/contas-a-pagar/pagamentos");
  revalidatePath("/contas-a-pagar");
}

export async function proporPagamentos(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const titulos = ids(form, "titulo");
  if (!titulos.length) return falha("Marque as contas que quer pagar.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("propor_pagamentos", { p_empresa: atual.id, p_titulos: titulos });
  if (error) return falha(mensagemBanco(error));
  atualizar();
  return sucesso(`${data} pagamento(s) proposto(s). Falta o master aprovar.`);
}

export async function cancelarPagamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_pagamento", { p_id: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  atualizar();
  return sucesso("Proposta cancelada.");
}

// Aprova no banco (marca enviado) e só então manda cada boleto ao Asaas. Recusa do Asaas fecha como falhou;
// sem resposta fica enviado com o aviso para conferir no Asaas (não dá para saber se pagou).
export async function aprovarPagamentos(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const escolhidos = ids(form, "pagamento");
  if (!escolhidos.length) return falha("Marque os pagamentos que quer aprovar.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: lote, error } = await supabase.rpc("aprovar_pagamentos", { p_empresa: atual.id, p_ids: escolhidos });
  if (error) return falha(mensagemBanco(error));
  const linhas = (lote ?? []) as { id: string; perfil_cobranca_id: string; linha: string; valor_cents: number; data_pagamento: string; descricao: string }[];
  const hoje = hojeISO(atual.fuso);
  let enviados = 0;
  const problemas: string[] = [];
  // os perfis do lote numa consulta só, e a credencial de cada perfil decifrada uma vez
  const { data: perfisLote } = linhas.length
    ? await supabase.from("perfis_cobranca").select("id").in("id", [...new Set(linhas.map((l) => l.perfil_cobranca_id))])
    : { data: [] };
  const perfis = new Map((perfisLote ?? []).map((perfil) => [perfil.id, perfil]));
  const credenciais = new Map<string, ReturnType<typeof credencialDoPerfil>>();
  for (const p of linhas) {
    try {
      const perfil = perfis.get(p.perfil_cobranca_id);
      if (!perfil) throw new AsaasErro(0, "perfil do Asaas não encontrado");
      if (!credenciais.has(perfil.id)) credenciais.set(perfil.id, credencialDoPerfil(perfil));
      const credencial = await credenciais.get(perfil.id)!;
      const r = await pagarBoleto(credencial, { linha: p.linha, data: p.data_pagamento, hoje, descricao: p.descricao, referencia: p.id });
      await supabase.rpc("registrar_envio_pagamento", { p_id: p.id, p_id_externo: r.id, p_erro: null });
      enviados++;
    } catch (e) {
      const recusa = e instanceof AsaasErro || (e instanceof Error && /Conecte a conta|chave do Asaas|SUPABASE_SECRET_KEY/.test(e.message));
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      await supabase.rpc("registrar_envio_pagamento", {
        p_id: p.id, p_id_externo: null,
        p_erro: recusa ? msg : `Sem resposta do Asaas (${msg}). Confira no Asaas antes de pagar de novo.`, p_incerto: !recusa,
      });
      problemas.push(`${p.descricao}: ${recusa ? msg : "sem resposta, confira no Asaas"}`);
    }
  }
  atualizar();
  if (problemas.length) return falha(`${enviados} enviado(s). Com problema: ${problemas.join(" | ")}`);
  return sucesso(`${enviados} pagamento(s) enviado(s) ao Asaas. A baixa entra quando o Asaas confirmar.`);
}
