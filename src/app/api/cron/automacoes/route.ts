import { tokenConfere } from "@/lib/asaas-mapa";
import { textoLembrete, textoPacoteContador, textoResumo, type ViveiroFaltando, type Resumo } from "@/lib/lembretes";
import { buscarNfesRecebidas } from "@/lib/focus";
import { avisarEmpresa } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarModelo, whatsappConfigurado } from "@/lib/whatsapp";
import { credencialDoPerfil, type Credencial } from "@/lib/asaas";
import { consultarBoleto, motivoFalha } from "@/lib/pagamentos-asaas";
import { numeroWhatsApp, parametrosCobranca, type FaixaCobranca } from "@/lib/whatsapp-texto";

type CobrancaDevida = {
  agendamento_id: string; faixa: FaixaCobranca; cliente: string; telefone: string; empresa: string;
  saldo_cents: number; vencimento: string; segunda_via: string | null;
};

export const maxDuration = 60;

// Rotina das automações (docs/automacoes.md). Chamada a cada 15 minutos pelo pg_cron do Supabase
// (migration 20261101100000_automacoes) com "Authorization: Bearer CRON_SECRET".
export async function GET(request: Request) {
  const recebido = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!tokenConfere(recebido, process.env.CRON_SECRET)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  const db = createAdminClient();
  const resultado: Record<string, number> = {};

  // A2: lembrete de apontamento que passou da hora
  const { data: lembretes } = await db.rpc("lembretes_apontamento_devidos");
  let avisos = 0;
  for (const l of (lembretes ?? []) as { empresa_id: string; turno: string; viveiros: ViveiroFaltando[] }[]) {
    const t = textoLembrete(l.turno, l.viveiros);
    avisos += await avisarEmpresa(db, l.empresa_id, { ...t, link: "/campo", tag: `apontamento-${l.turno}` });
  }
  resultado.lembretes_apontamento = avisos;

  // H3: resumo do dia para quem vê relatórios
  const { data: resumos } = await db.rpc("resumos_diarios_devidos");
  avisos = 0;
  for (const r of (resumos ?? []) as { empresa_id: string; dia: string; resumo: Resumo }[]) {
    avisos += await avisarEmpresa(db, r.empresa_id, { ...textoResumo(r.resumo), link: "/painel", tag: "resumo-diario" }, "relatorios.ver");
  }
  resultado.resumos = avisos;

  // E1: aviso do mês anterior (pacote do contador). O fechamento do ponto (F1) saiu com o RH.
  const { data: mensais } = await db.rpc("avisos_mensais_devidos");
  avisos = 0;
  for (const m of (mensais ?? []) as { empresa_id: string; tipo: string; mes: string }[]) {
    if (m.tipo === "pacote_contador") {
      avisos += await avisarEmpresa(db, m.empresa_id,
        { ...textoPacoteContador(m.mes), link: `/relatorios/contador?mes=${m.mes}`, tag: `pacote-${m.mes}` }, "relatorios.ver");
    }
  }
  resultado.avisos_mensais = avisos;

  // B1: NF-e de compra emitidas contra o CNPJ da piscicultura (uma consulta por hora por empresa)
  const { data: mde } = await db.rpc("mde_empresas_ligadas");
  let novas = 0;
  for (const e of (mde ?? []) as { empresa_id: string; cnpj: string; versao: number }[]) {
    try {
      const { notas, versao } = await buscarNfesRecebidas(e.empresa_id, e.cnpj, Number(e.versao));
      const { data: n } = await db.rpc("registrar_nfes_recebidas", { p_empresa: e.empresa_id, p_notas: notas, p_versao: versao });
      if (n) {
        novas += n;
        await avisarEmpresa(db, e.empresa_id, {
          titulo: n === 1 ? "Chegou 1 nota de compra" : `Chegaram ${n} notas de compra`,
          texto: "Emitidas para o CNPJ da piscicultura. Confira e lance como conta a pagar.",
          link: "/notas/recebidas", tag: "nfes-recebidas",
        }, "contas-a-pagar.editar");
      }
    } catch (erro) {
      console.error("busca de NF-e recebidas", e.empresa_id, erro);
    }
  }
  resultado.nfes_recebidas = novas;

  // D2: pedidos fixos de amanhã, gerados em aberto para conferir
  const { data: fixos } = await db.rpc("gerar_pedidos_fixos");
  let gerados = 0;
  for (const f of (fixos ?? []) as { empresa_id: string; gerados: number; erros: number }[]) {
    gerados += f.gerados;
    await avisarEmpresa(db, f.empresa_id, {
      titulo: f.gerados === 1 ? "1 pedido fixo para amanhã" : `${f.gerados} pedidos fixos para amanhã`,
      texto: f.erros ? `Confira as quantidades e fature. ${f.erros} não saiu (veja em Pedidos fixos).` : "Confira as quantidades e fature.",
      link: "/vendas/fixos", tag: "pedidos-fixos",
    }, "vendas.lancar");
  }
  resultado.pedidos_fixos = gerados;

  // D4 pelo WhatsApp (H2): lembrete ao cliente antes do vencimento, no dia e na primeira semana de atraso
  let cobrancas = 0;
  if (whatsappConfigurado()) {
    const { data: devidas } = await db.rpc("cobrancas_whatsapp_devidas");
    for (const c of (devidas ?? []) as CobrancaDevida[]) {
      const para = numeroWhatsApp(c.telefone);
      if (!para) continue;
      // marca antes de mandar: se a Meta falhar, não sai duas vezes na mesma fase
      const { data: marcou } = await db.rpc("marcar_cobranca_whatsapp", { p_agendamento: c.agendamento_id, p_faixa: c.faixa, p_telefone: para });
      if (!marcou) continue;
      const r = await enviarModelo(para, "balbina_cobranca", parametrosCobranca({
        cliente: c.cliente, empresa: c.empresa, saldoCents: Number(c.saldo_cents), vencimento: c.vencimento, faixa: c.faixa, segundaVia: c.segunda_via,
      })).catch((e: unknown) => ({ ok: false, erro: String(e) }));
      if (r.ok) cobrancas++;
      else console.error("cobrança por WhatsApp", c.agendamento_id, r.erro);
    }
  }
  resultado.cobrancas_whatsapp = cobrancas;
  // C7: pagamentos enviados ao Asaas; pago vira baixa, falha volta para a tela
  const { data: conferir } = await db.rpc("pagamentos_para_conferir");
  let pagos = 0;
  const credenciais = new Map<string, Credencial>();
  for (const p of (conferir ?? []) as { id: string; perfil_cobranca_id: string; id_externo: string }[]) {
    try {
      if (!credenciais.has(p.perfil_cobranca_id)) {
        const { data: perfil } = await db.from("perfis_cobranca").select("id").eq("id", p.perfil_cobranca_id).single();
        if (!perfil) continue;
        credenciais.set(p.perfil_cobranca_id, await credencialDoPerfil(perfil));
      }
      const b = await consultarBoleto(credenciais.get(p.perfil_cobranca_id)!, p.id_externo);
      const data = (b.paymentDate ?? b.scheduleDate ?? null)?.slice(0, 10) ?? null;
      const { data: r } = await db.rpc("atualizar_pagamento_saida", { p_id: p.id, p_status: b.status ?? "", p_data: data, p_motivo: motivoFalha(b) });
      if (r === "pago") pagos++;
    } catch (erro) {
      console.error("conferir pagamento no Asaas", p.id, erro);
    }
  }
  resultado.pagamentos_pagos = pagos;

  // mensagens já tratadas do webhook só servem para barrar o reenvio da Meta
  await db.from("whatsapp_mensagens").delete().lt("recebida_em", new Date(Date.now() - 7 * 86_400_000).toISOString());

  return Response.json({ ok: true, ...resultado });
}
