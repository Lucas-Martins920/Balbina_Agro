import db from "../db";
import { LancarInsumoOutput } from "../schemas";

export function insertInsumo(
  p: LancarInsumoOutput["payload"],
  loteId: string | null
) {
  const stmt = db.prepare(`
    INSERT INTO insumos (id, tipo, descricao, quantidade, unidade, preco_unitario, fornecedor, tanque_id, lote_id, data_compra)
    VALUES (@id,@tipo,@descricao,@quantidade,@unidade,@preco_unitario,@fornecedor,@tanque_id,@lote_id,@data_compra)
  `);
  stmt.run({
    id: p.insumoId,
    tipo: p.tipo,
    descricao: p.descricao ?? null,
    quantidade: p.quantidade,
    unidade: p.unidade ?? null,
    preco_unitario: p.precoUnitario ?? null,
    fornecedor: p.fornecedor ?? null,
    tanque_id: p.tanqueId ?? null,
    lote_id: loteId,
    data_compra: p.dataCompra
  });
}

export function findActiveLoteIdByTanque(tanqueId?: string): string | null {
  if (!tanqueId?.trim()) return null;

  const row = db.prepare(`
    SELECT id
    FROM lotes
    WHERE tanque_id = @tanqueId
      AND status = 'ativo'
    ORDER BY data_inicio DESC, criado_em DESC
    LIMIT 1
  `).get({ tanqueId }) as { id: string } | undefined;

  return row?.id ?? null;
}