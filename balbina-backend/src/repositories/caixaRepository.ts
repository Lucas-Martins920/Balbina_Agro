import db from "../db";
import { v4 as uuidv4 } from "uuid";

export type TipoCaixa = "entrada" | "saida";

export type MovimentoCaixa = {
  id: string;
  tipo: TipoCaixa;
  valor: number;
  descricao: string | null;
  referenciaId: string | null;
  loteId: string | null;
  dataMovimento: string;
};

export function insertCaixaMovimento(
  tipo: TipoCaixa,
  valor: number,
  descricao?: string,
  referenciaId?: string | null,
  dataMovimento?: string,
  loteId?: string | null
): string {
  const id = uuidv4();

  db.prepare(`
    INSERT INTO caixa (
      id,
      tipo,
      valor,
      descricao,
      referencia_id,
      data_movimento,
      lote_id
    )
    VALUES (
      @id,
      @tipo,
      @valor,
      @descricao,
      @referencia_id,
      @data_movimento,
      @lote_id
    )
  `).run({
    id,
    tipo,
    valor,
    descricao: descricao ?? null,
    referencia_id: referenciaId ?? null,
    data_movimento:
      dataMovimento ?? new Date().toISOString(),
    lote_id: loteId ?? null,
  });

  return id;
}

export function getSaldo(): {
  saldo: number;
  entradas: number;
  saidas: number;
} {
  const entradasRow = db
    .prepare(`
      SELECT COALESCE(SUM(valor), 0) AS total
      FROM caixa
      WHERE tipo = 'entrada'
    `)
    .get() as { total: number };

  const saidasRow = db
    .prepare(`
      SELECT COALESCE(SUM(valor), 0) AS total
      FROM caixa
      WHERE tipo = 'saida'
    `)
    .get() as { total: number };

  const entradas = Number(entradasRow.total);
  const saidas = Number(saidasRow.total);

  return {
    saldo: entradas - saidas,
    entradas,
    saidas,
  };
}

export function listarMovimentosCaixa(): MovimentoCaixa[] {
  return db
    .prepare(`
      SELECT
        id,
        tipo,
        valor,
        descricao,
        referencia_id AS referenciaId,
        lote_id AS loteId,
        data_movimento AS dataMovimento
      FROM caixa
      ORDER BY data_movimento DESC, criado_em DESC
    `)
    .all() as MovimentoCaixa[];
}

export function calcularCustoDoLote(
  loteId: string
): number {
  const row = db
    .prepare(`
      SELECT COALESCE(SUM(valor), 0) AS total
      FROM caixa
      WHERE tipo = 'saida'
        AND lote_id = @loteId
    `)
    .get({ loteId }) as { total: number };

  return Number(row.total);
}