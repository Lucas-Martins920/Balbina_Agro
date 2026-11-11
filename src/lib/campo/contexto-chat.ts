// Chat de manejo do app de campo: o que a pessoa manda e os dados da piscicultura que a IA recebe junto.
// Regra pura (sem chave nem rede), para os testes; a chamada à IA fica em chat.ts.

import type { PlanoRacao } from "../previsao-racao-dados.ts";
import type { Valor } from "../previsao-racao.ts";
import type { MedicamentoOpcao, Opcao, PainelCampo } from "./tipos.ts";

export type MensagemChat = { papel: "pessoa" | "assistente"; texto: string };

export const MAX_MENSAGENS = 12;
export const MAX_TEXTO = 1500;

// Conversa recente que o celular manda (as mais antigas ficam de fora). A última precisa ser da pessoa.
export function validarConversa(v: unknown): { ok: { mensagens: MensagemChat[]; kgSaco: number | null } } | { erro: string } {
  if (!v || typeof v !== "object") return { erro: "Mensagem inválida." };
  const c = v as { mensagens?: unknown; kg_saco?: unknown };
  if (!Array.isArray(c.mensagens) || c.mensagens.length === 0 || c.mensagens.length > 40) return { erro: "Mensagem inválida." };
  const mensagens: MensagemChat[] = [];
  for (const m of c.mensagens.slice(-MAX_MENSAGENS) as Record<string, unknown>[]) {
    if (!m || (m.papel !== "pessoa" && m.papel !== "assistente") || typeof m.texto !== "string") return { erro: "Mensagem inválida." };
    const texto = m.texto.trim().slice(0, MAX_TEXTO);
    if (texto) mensagens.push({ papel: m.papel, texto });
  }
  if (mensagens.at(-1)?.papel !== "pessoa") return { erro: "Escreva a sua mensagem." };
  // a conversa enviada começa pela pessoa
  while (mensagens[0]?.papel === "assistente") mensagens.shift();
  const kg = typeof c.kg_saco === "number" && Number.isFinite(c.kg_saco) && c.kg_saco > 0 && c.kg_saco <= 100 ? c.kg_saco : null;
  return { ok: { mensagens, kgSaco: kg } };
}

const n = (v: number | null | undefined, casas = 1) => (v === null || v === undefined ? null : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

// Bloco com os dados de hoje (muda a cada pedido, fica fora do cache). Os ids vão inteiros: a IA copia nos cartões.
export function textoDadosPiscicultura(p: { painel: PainelCampo; medicamentos: MedicamentoOpcao[]; racoes: Opcao[]; hoje: string; kgSaco: number | null; plano?: PlanoRacao | null }): string {
  const linhas = [`# DADOS DA PISCICULTURA (hoje ${dataBr(p.hoje)}; kg por saco de ração: ${p.kgSaco !== null ? n(p.kgSaco) : "não informado"})`, "", "## Viveiros"];
  for (const t of p.painel.tanques) {
    const l = t.lote;
    if (!l) {
      linhas.push(`- id ${t.id}: ${t.rotulo} · vazio${t.area_m2 ? ` · ${n(t.area_m2, 0)} m²` : ""}`);
      continue;
    }
    const partes = [
      `lote ${l.codigo}, ${l.fase}${l.especie ? `, ${l.especie.toLowerCase()}` : ""}, ${l.dias} dias`,
      `${n(l.peixes, 0)} peixes`,
      l.peso_g !== null ? `${n(l.peso_g, 0)} g de peso médio estimado` : null,
      l.biomassa_kg !== null ? `${n(l.biomassa_kg, 0)} kg de biomassa` : null,
      l.racao ? `ração sugerida ${n(l.racao.kg)} kg/dia${l.racao.refeicoes ? ` em ${l.racao.refeicoes} refeições` : ""}${l.racao.fase ? ` (${l.racao.fase}` : ""}${l.racao.proteina ? `, ${n(l.racao.proteina, 0)}% de proteína` : ""}${l.racao.granulo ? `, ${l.racao.granulo}` : ""}${l.racao.fase ? ")" : ""}` : null,
      l.racao?.oxigenio_min !== null && l.racao?.oxigenio_min !== undefined ? `oxigênio mínimo recente ${n(l.racao.oxigenio_min)} mg/L` : null,
      l.racao?.alerta ? `alerta: ${l.racao.alerta}` : null,
      l.ultima_biometria ? `última biometria ${dataBr(l.ultima_biometria)}` : "sem biometria",
      l.conversao !== null ? `conversão alimentar ${n(l.conversao, 2)}` : null,
      l.carencia_ate ? `em carência de medicamento até ${dataBr(l.carencia_ate)}` : null,
    ].filter(Boolean);
    linhas.push(`- id ${t.id}: ${t.rotulo} · ${partes.join(" · ")}`);
  }
  linhas.push("", "## Rações");
  linhas.push(...(p.racoes.length ? p.racoes.map((r) => `- id ${r.id}: ${r.nome}`) : ["- nenhuma cadastrada (lance só os kg)"]));
  linhas.push("", "## Corretivos e outros insumos");
  linhas.push(...(p.painel.insumos.length
    ? p.painel.insumos.map((i) => `- id ${i.id}: ${i.nome} (${i.unidade})${i.saldo !== null ? `, saldo ${n(i.saldo, 3)} ${i.unidade}` : ""}`)
    : ["- nenhum cadastrado"]));
  linhas.push("", "## Medicamentos e vitaminas");
  linhas.push(...(p.medicamentos.length
    ? p.medicamentos.map((m) => `- id ${m.id}: ${m.nome}${m.dose ? ` (dose do cadastro ${n(m.dose, 4)} ${m.unidade}${m.via === "racao" ? " por kg de ração" : " por m³"})` : ""}${m.carencia ? `, carência ${m.carencia} dias` : ""}`)
    : ["- nenhum cadastrado"]));
  if (p.plano) linhas.push("", ...textoPlanoRacao(p.plano));
  return linhas.join("\n");
}

// Etiqueta de origem de cada número: a IA precisa dizer se é medido, calculado, previsão, recomendação ou se falta.
const CONFIANCA = { alta: "alta", media: "média", baixa: "baixa", indisponivel: "indisponível (previsão não feita)" } as const;
const ORIGEM = { medido: "medido", calculado: "calculado", previsao: "previsão", recomendacao: "recomendação", ausente: "ausente" } as const;
function comOrigem<T>(v: Valor<T>, texto: (x: T) => string): string {
  if (v.valor === null || v.origem === "ausente") return `[ausente${v.nota ? `: ${v.nota}` : ""}]`;
  return `${texto(v.valor)} [${ORIGEM[v.origem]}${v.nota ? `; ${v.nota}` : ""}]`;
}

// Planejamento da ração calculado pelo sistema (previsao-racao.ts): a IA explica, não refaz a conta.
export function textoPlanoRacao(plano: PlanoRacao): string[] {
  const kg = (v: number, casas = 1) => `${n(v, casas)} kg`;
  const linhas = [`## Planejamento da ração (calculado pelo sistema; reserva de até ${plano.parametros.reserva_sacos} sacos, entrega em ${plano.parametros.prazo_entrega_dias} dias)`];
  if (!plano.lotes.length) linhas.push("- nenhum lote ativo");
  for (const { codigo, especie, previsao: v } of plano.lotes) {
    linhas.push(`- lote ${codigo} (${especie ?? "espécie não informada"}) · confiança ${CONFIANCA[v.confianca]}${v.motivos.length ? ` (${v.motivos.join("; ")})` : ""}`);
    if (v.semDadosTecnicos) linhas.push(`  - sem dados técnicos para ${especie ?? "esta espécie"}: não há tabela de arraçoamento cadastrada; não use números do tambaqui`);
    linhas.push(
      `  - última biometria: ${comOrigem(v.pesoUltimaBiometria, (x) => `${n(x)} g`)}${v.dataUltimaBiometria ? ` em ${dataBr(v.dataUltimaBiometria)}` : ""}`,
      `  - peso médio hoje: ${comOrigem(v.pesoHoje, (x) => `${n(x)} g`)} · peixes vivos: ${comOrigem(v.peixes, (x) => n(x, 0)!)} · biomassa: ${comOrigem(v.biomassaKg, (x) => kg(x, 0))}`,
      `  - ganho: ${comOrigem(v.ganhoG, (x) => `${n(x)} g`)} · GMD: ${comOrigem(v.gmdG, (x) => `${n(x, 2)} g/dia`)}`,
      `  - taxa da tabela: ${comOrigem(v.taxaPct, (x) => `${n(x, 2)}% da biomassa/dia`)}${v.faixaAtual ? ` (faixa ${v.faixaAtual.fase}${v.faixaAtual.fonte ? `, fonte ${v.faixaAtual.fonte}` : ""})` : ""}`,
      `  - consumo diário previsto: ${comOrigem(v.consumoDiaKg, (x) => kg(x))} · trato real: ${comOrigem(v.consumoRealDiaKg, (x) => `${kg(x)}/dia`)} · sobra: ${comOrigem(v.sobra, (x) => kg(x))}`,
      `  - ração atual: ${comOrigem(v.racaoAtual, (r) => r.nome)} · próxima: ${v.proximaRacao.valor || !v.proximaRecomendada ? comOrigem(v.proximaRacao, (r) => r.nome) : `comprar ${v.proximaRecomendada} [recomendação; não cadastrada]`} · troca: ${comOrigem(v.transicao, dataBr)}`,
      `  - estoque da ração atual: ${comOrigem(v.estoqueAtualKg, (x) => kg(x, 0))} · cobertura: ${comOrigem(v.coberturaDias, (x) => `${x} dias`)} · falta em: ${comOrigem(v.dataFalta, dataBr)}`,
    );
    if (v.horizontes.length) {
      linhas.push(`  - previsão de consumo [previsão]: ${v.horizontes.map((h) => `${h.dias} dias ${kg(h.kg, 0)}${h.sacos !== null ? ` (${n(h.sacos)} sacos)` : ""}${h.kgProxima ? `, sendo ${kg(h.kgProxima, 0)} da próxima` : ""}`).join(" · ")}`);
    } else linhas.push("  - previsão de consumo: [ausente: sem consumo diário previsto]");
  }
  linhas.push("", "## Estoque e reserva por ração (estoque [medido], reserva e compra [recomendação])");
  if (!plano.reserva.length) linhas.push("- nenhuma ração com consumo previsto");
  for (const r of plano.reserva) {
    linhas.push(`- ${r.racao.nome}${r.racao.saco_kg ? ` (saco de ${n(r.racao.saco_kg)} kg)` : " (sem peso do saco)"}: estoque ${kg(r.estoqueKg, 0)}${r.estoqueSacos !== null ? ` = ${n(r.estoqueSacos, 2)} sacos` : ""}`
      + ` · consumo em ${r.janelaDias} dias ${kg(r.consumoJanelaKg, 0)} [previsão]`
      + ` · reserva ${r.reservaSacos !== null ? `${r.reservaSacos} sacos` : kg(r.reservaKg, 0)} [recomendação]`
      + `${r.venceAntesKg > 0 ? ` · ${kg(r.venceAntesKg, 0)} vencem antes de usar` : ""}`
      + ` · comprar ${r.comprarSacos !== null ? `${r.comprarSacos} sacos` : kg(r.comprarKg, 0)} [recomendação]${r.nota ? ` (${r.nota})` : ""}`);
  }
  return linhas;
}
