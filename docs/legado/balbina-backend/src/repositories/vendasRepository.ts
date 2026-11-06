import db from "../db";
import { v4 as uuidv4 } from "uuid";

export type NovaVenda = {
  loteId: string;
  dataVenda: string;
  kgVendidos: number;
  valorTotal: number;
  comprador?: string | null;
};

export function loteExiste(loteId: string): boolean {
  const row = db
    .prepare(`
      SELECT id
      FROM lotes
      WHERE id = @loteId
    `)
    .get({ loteId }) as { id?: string } | undefined;

  return Boolean(row?.id);
}

export type LoteResumo = {
  id: string;
  especie: string;
  status: string;
  kg_colhidos: number | null;
};

export function obterLote(loteId: string): LoteResumo | undefined {
  return db
    .prepare(`
      SELECT id, especie, status, kg_colhidos
      FROM lotes
      WHERE id = @loteId
    `)
    .get({ loteId }) as LoteResumo | undefined;
}

export function inserirVenda(venda: NovaVenda) {
  const id = uuidv4();

  db.prepare(`
    INSERT INTO vendas (
      id,
      lote_id,
      data_venda,
      kg_vendidos,
      valor_total,
      comprador
    )
    VALUES (
      @id,
      @lote_id,
      @data_venda,
      @kg_vendidos,
      @valor_total,
      @comprador
    )
  `).run({
    id,
    lote_id: venda.loteId,
    data_venda: venda.dataVenda,
    kg_vendidos: venda.kgVendidos,
    valor_total: venda.valorTotal,
    comprador: venda.comprador ?? null,
  });

  return {
    id,
    ...venda,
  };
}

export function listarVendas() {
  return db
    .prepare(`
      SELECT
        vendas.id,
        vendas.lote_id,
        vendas.data_venda,
        vendas.kg_vendidos,
        vendas.valor_total,
        vendas.comprador,
        vendas.criado_em,
        lotes.especie,
        lotes.tanque_id
      FROM vendas
      INNER JOIN lotes
        ON lotes.id = vendas.lote_id
      ORDER BY vendas.data_venda DESC, vendas.criado_em DESC
    `)
    .all();
}

export function totalVendidoDoLote(loteId: string): number {
  const row = db
    .prepare(`
      SELECT COALESCE(SUM(kg_vendidos), 0) AS total
      FROM vendas
      WHERE lote_id = @loteId
    `)
    .get({ loteId }) as { total: number };

  return Number(row.total);
}