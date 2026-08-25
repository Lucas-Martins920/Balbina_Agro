import db from "../db";
import { inserirMovimentoEstoque } from "../repositories/estoqueRepository";

export type FechamentoLote = {
  loteId: string;
  kgColhidos: number;
  dataFechamento: string;
};

export type ResultadoFechamento = {
  loteId: string;
  status: "fechado";
  dataFechamento: string;
  kgColhidos: number;
  custoTotal: number;
  custoPorKg: number;
};

type LoteRow = {
  id: string;
  especie: string;
  status: string;
};

type CustoRow = {
  total: number;
};

export function fecharLote(
  fechamento: FechamentoLote
): ResultadoFechamento {
  if (!fechamento.loteId.trim()) {
    throw new Error("O identificador do lote é obrigatório.");
  }

  if (fechamento.kgColhidos <= 0) {
    throw new Error(
      "A quantidade de quilos colhidos deve ser maior que zero."
    );
  }

  if (
    Number.isNaN(
      Date.parse(fechamento.dataFechamento)
    )
  ) {
    throw new Error("A data de fechamento é inválida.");
  }

  const lote = db
    .prepare(`
      SELECT
        id,
        especie,
        status
      FROM lotes
      WHERE id = @loteId
    `)
    .get({
      loteId: fechamento.loteId,
    }) as LoteRow | undefined;

  if (!lote) {
    throw new Error("Lote não encontrado.");
  }

  if (lote.status === "fechado") {
    throw new Error("Este lote já está fechado.");
  }

  const custo = db
    .prepare(`
      SELECT COALESCE(SUM(valor), 0) AS total
      FROM caixa
      WHERE tipo = 'saida'
        AND lote_id = @loteId
    `)
    .get({
      loteId: fechamento.loteId,
    }) as CustoRow;

  const custoTotal = Number(custo.total);
  const custoPorKg =
    custoTotal / fechamento.kgColhidos;

  const executarFechamento = db.transaction(() => {
    db.prepare(`
      UPDATE lotes
      SET
        status = 'fechado',
        data_fechamento = @dataFechamento,
        kg_colhidos = @kgColhidos,
        custo_total = @custoTotal,
        custo_por_kg = @custoPorKg
      WHERE id = @loteId
    `).run({
      loteId: fechamento.loteId,
      dataFechamento: fechamento.dataFechamento,
      kgColhidos: fechamento.kgColhidos,
      custoTotal,
      custoPorKg,
    });

    inserirMovimentoEstoque({
      item: lote.especie,
      categoria: "peixe",
      quantidade: fechamento.kgColhidos,
      unidade: "kg",
      tipoMovimento: "entrada",
      referenciaId: fechamento.loteId,
      dataMovimento: fechamento.dataFechamento,
    });
  });

  executarFechamento();

  return {
    loteId: fechamento.loteId,
    status: "fechado",
    dataFechamento: fechamento.dataFechamento,
    kgColhidos: fechamento.kgColhidos,
    custoTotal,
    custoPorKg,
  };
}