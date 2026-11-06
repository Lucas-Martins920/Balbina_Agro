import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarApontamentoCampo } from "@/lib/apontamento-campo";
import { hojeISO } from "@/lib/formato";
import { carregarSugestoes } from "@/lib/sugestao-apontamento-dados";

// O que o apontamento de campo precisa para funcionar sem sinal, e a gravação do que chega da fila.
// Usado pela tela /campo + /api/apontamentos (sessão por cookie) e pelo app de celular
// (/api/app/campo e /api/app/apontamentos, token no cabeçalho): a regra é uma só.

export type EmpresaCampo = { id: string; fuso: string; apontar_qualidade_agua: boolean };

export async function dadosCampo(supabase: SupabaseClient, empresa: EmpresaCampo) {
  const [{ data: viveiros }, { data: medicamentos }, { data: racoes }, { data: checklist }] = await Promise.all([
    supabase.from("alocacoes_atuais").select("viveiro_id, viveiro_nome, setor_nome, lote_id, lote_codigo, fase, peixes_atuais")
      .eq("empresa_id", empresa.id).order("setor_nome").order("viveiro_nome"),
    supabase.from("medicamentos").select("id, nome, dose_por_unidade, unidade_dose, via, carencia_dias").eq("empresa_id", empresa.id).eq("ativo", true).order("nome"),
    supabase.from("produtos").select("id, nome").eq("empresa_id", empresa.id).eq("tipo", "racao").eq("ativo", true).order("nome"),
    supabase.from("checklist_itens").select("id, nome, tipo, unidade, aplica_em").eq("empresa_id", empresa.id).eq("ativo", true).order("ordem").order("nome"),
  ]);
  const hoje = hojeISO(empresa.fuso);
  const sugestoes = await carregarSugestoes(empresa.id, hoje, (viveiros ?? []).map((g) => ({ viveiro_id: g.viveiro_id, lote_id: g.lote_id })), supabase);
  return {
    hoje,
    agua: empresa.apontar_qualidade_agua,
    viveiros: (viveiros ?? []).map((g) => ({ id: g.viveiro_id, nome: `${g.setor_nome} / ${g.viveiro_nome}`, lote: g.lote_codigo, peixes: g.peixes_atuais,
      fase: g.fase as string, checklist: g.fase === "engorda" ? "engorda" : "alevinagem_recria" })),
    medicamentos: (medicamentos ?? []).map((m) => ({
      id: m.id as string, nome: m.nome as string, dose: m.dose_por_unidade === null ? null : Number(m.dose_por_unidade), unidade: m.unidade_dose as string,
      via: (m.via as string | null) ?? null, carencia: Number(m.carencia_dias ?? 0),
    })),
    racoes: (racoes ?? []).map((r) => ({ id: r.id, nome: r.nome })),
    checklist: checklist ?? [],
    sugestoes,
  };
}

type Resposta = { id?: string; situacao: "novo" | "repetido" | "conflito"; existentes?: unknown[] };

// Tudo entra numa transação só (lançamento, ração por tipo, checklist e medicação); o client_id torna o
// reenvio inofensivo. Se o viveiro já tem lançamento no mesmo dia e turno, devolve 409 com o que já existe
// e o celular pergunta se soma mesmo assim (forcar).
export async function gravarApontamentoCampo(supabase: SupabaseClient, empresa: EmpresaCampo, corpo: unknown): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const v = validarApontamentoCampo(corpo, hojeISO(empresa.fuso));
  if ("erro" in v) return { status: 422, corpo: { erro: v.erro } };
  const a = v.ok;
  const { data, error } = await supabase.rpc("registrar_lancamento_campo", {
    p_empresa: empresa.id,
    p_viveiro: a.viveiro_id,
    p_data: a.data,
    p_turno: a.turno,
    p_mortes: a.mortes,
    p_descartes: a.descartes,
    p_racao_kg: a.racao_kg,
    p_observacoes: a.observacoes,
    p_client_id: a.client_id,
    p_racoes: a.racoes,
    p_checklist: a.checklist,
    p_medicacao: a.medicacao,
    p_forcar: a.forcar,
    p_agua: empresa.apontar_qualidade_agua ? a.agua : null,
  });
  if (error) {
    const erro = error.message.includes("baixas_cabem") ? "Mortes e descartes passam do número de peixes do viveiro." : error.message;
    return { status: 422, corpo: { erro } };
  }
  const r = data as Resposta;
  if (r.situacao === "conflito") {
    return { status: 409, corpo: { erro: "Este viveiro já tem lançamento neste dia e turno.", conflito: r.existentes ?? [] } };
  }
  // causa das baixas: depois do lançamento; num reenvio ("repetido") grava de novo o mesmo valor
  if (r.id && Object.keys(a.causas).length) {
    const { error: erroCausas } = await supabase.from("apontamento_lancamentos").update({ causas_morte: a.causas }).eq("empresa_id", empresa.id).eq("id", r.id);
    if (erroCausas) return { status: 422, corpo: { erro: `O lançamento foi salvo, mas a causa das baixas não: ${erroCausas.message}` } };
  }
  return { status: 200, corpo: { id: r.id, situacao: r.situacao } };
}
