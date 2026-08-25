import db from "../db";
import { AbrirLoteOutput } from "../schemas";

export function insertLote(payload: AbrirLoteOutput["payload"]) {
  const statement = db.prepare(`
    INSERT INTO lotes (
      id,
      especie,
      tanque_id,
      data_inicio,
      estoque_inicial,
      unidade,
      observacoes,
      manejo_json
    )
    VALUES (
      @id,
      @especie,
      @tanque_id,
      @data_inicio,
      @estoque_inicial,
      @unidade,
      @observacoes,
      @manejo_json
    )
  `);

  statement.run({
    id: payload.loteId,
    especie: payload.especie,
    tanque_id: payload.tanqueId,
    data_inicio: payload.dataInicio,
    estoque_inicial: payload.estoqueInicial,
    unidade: payload.unidade ?? "peixes",
    observacoes: payload.observacoes ?? null,
    manejo_json: JSON.stringify(payload.manejo ?? {}),
  });
}

export function listLotes() {
  return db
    .prepare(`
      SELECT
        id,
        especie,
        tanque_id,
        data_inicio,
        estoque_inicial,
        unidade,
        observacoes,
        manejo_json,
        criado_em
      FROM lotes
      ORDER BY criado_em DESC
    `)
    .all();
}