// Ração por tipo e checklist do viveiro no formulário do apontamento diário.
import { lerDecimal } from "./formato.ts";

export const LINHAS_RACAO = 4;

type Leitor = { get(nome: string): FormDataEntryValue | null };
type Resultado<T> = { ok: T } | { erro: string };

export type RacaoLancada = { produto_id: string; kg: number };

// Linhas racao_produto_N / racao_kg_N e o campo racao_kg (kg sem tipo, quando a piscicultura não baixa estoque).
export function lerRacoes(form: Leitor): Resultado<{ itens: RacaoLancada[]; totalKg: number }> {
  const semTipo = lerDecimal(form.get("racao_kg"));
  if (semTipo !== null && semTipo < 0) return { erro: "Ração inválida." };
  const itens: RacaoLancada[] = [];
  for (let i = 0; i < LINHAS_RACAO; i++) {
    const produto = String(form.get(`racao_produto_${i}`) ?? "");
    const texto = String(form.get(`racao_kg_${i}`) ?? "").trim();
    if (!produto && !texto) continue;
    const kg = lerDecimal(texto);
    if (!produto || kg === null || kg <= 0) return { erro: `Ração, linha ${i + 1}: escolha o tipo e informe os kg.` };
    itens.push({ produto_id: produto, kg });
  }
  const totalKg = Math.round((itens.reduce((s, r) => s + r.kg, 0) + (semTipo ?? 0)) * 1000) / 1000;
  return { ok: { itens, totalKg } };
}

export type ItemChecklist = { id: string; tipo: string; nome?: string };
export type RespostaChecklist = { item_id: string; ok?: boolean; valor?: number };

// Campo ck_<id>: "ok" / "nao" para sim ou não, número para os itens medidos. Em branco fica de fora.
export function lerChecklist(form: Leitor, itens: ItemChecklist[]): Resultado<RespostaChecklist[]> {
  const respostas: RespostaChecklist[] = [];
  for (const item of itens) {
    const bruto = String(form.get(`ck_${item.id}`) ?? "").trim();
    if (!bruto) continue;
    if (item.tipo === "numero") {
      const valor = lerDecimal(bruto);
      if (valor === null) return { erro: `${item.nome ?? "Checklist"}: informe um número.` };
      respostas.push({ item_id: item.id, valor });
    } else {
      respostas.push({ item_id: item.id, ok: bruto === "ok" });
    }
  }
  return { ok: respostas };
}
