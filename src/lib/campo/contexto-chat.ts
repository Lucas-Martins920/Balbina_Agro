// Chat de manejo do app de campo: o que a pessoa manda e os dados da piscicultura que a IA recebe junto.
// Regra pura (sem chave nem rede), para os testes; a chamada à IA fica em chat.ts.

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
export function textoDadosPiscicultura(p: { painel: PainelCampo; medicamentos: MedicamentoOpcao[]; racoes: Opcao[]; hoje: string; kgSaco: number | null }): string {
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
  return linhas.join("\n");
}
