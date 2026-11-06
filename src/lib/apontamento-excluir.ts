// Quem pode mexer num lançamento (excluir ou editar) e o período da lista. A mesma regra está no banco
// (app.pode_mexer_lancamento, migration 20261101120000_apagar_apontamentos.sql); aqui só decide o botão.
import { hojeISO, somarDias } from "./formato.ts";

export const MAX_DIAS_LISTA = 62;

// gerencia = tem lotes.editar (gerente da piscicultura, master). Os outros só excluem o que lançaram hoje.
export function podeExcluirLancamento(p: {
  gerencia: boolean; eu: string | null; criadoPor: string | null; criadoEm: string; fuso: string; agora?: Date;
}) {
  if (p.gerencia) return true;
  if (!p.eu || p.criadoPor !== p.eu) return false;
  return hojeISO(p.fuso, new Date(p.criadoEm)) === hojeISO(p.fuso, p.agora);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const valida = (v: unknown, hoje: string) =>
  typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v)) && v <= hoje ? v : null;

// Período da lista de lançamentos (?de=&ate=): padrão hoje e os dois dias anteriores.
export function periodoLancamentos(filtros: { de?: unknown; ate?: unknown }, hoje: string) {
  let de = valida(filtros.de, hoje) ?? somarDias(hoje, -2);
  let ate = valida(filtros.ate, hoje) ?? hoje;
  if (de > ate) [de, ate] = [ate, de];
  if (somarDias(de, MAX_DIAS_LISTA - 1) < ate) de = somarDias(ate, -(MAX_DIAS_LISTA - 1));
  return { de, ate };
}
