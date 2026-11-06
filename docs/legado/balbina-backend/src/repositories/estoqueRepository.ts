import db from "../db";
import { v4 as uuidv4 } from "uuid";

export type TipoMovimentoEstoque = "entrada" | "saida";

export type NovoMovimentoEstoque = {
  item: string;
  categoria: "racao" | "peixe";
  quantidade: number;
  unidade: string;
  tipoMovimento: TipoMovimentoEstoque;
  referenciaId?: string | null;
  dataMovimento: string;
};

export type SaldoEstoque = {
  item: string;
  categoria: string;
  unidade: string;
  saldo: number;
};

function normalizarItem(item: string): string {
  return item.trim().toLowerCase();
}

export function obterSaldoItem(
  item: string,
  categoria: string
): number {
  const result = db
    .prepare(`
      SELECT COALESCE(
        SUM(
          CASE
            WHEN tipo_movimento = 'entrada' THEN quantidade
            WHEN tipo_movimento = 'saida' THEN -quantidade
            ELSE 0
          END
        ),
        0
      ) AS saldo
      FROM estoque
      WHERE LOWER(TRIM(item)) = @item
        AND categoria = @categoria
    `)
    .get({
      item: normalizarItem(item),
      categoria,
    }) as { saldo: number };

  return Number(result.saldo);
}

export function inserirMovimentoEstoque(
  movimento: NovoMovimentoEstoque
) {
  const itemNormalizado = normalizarItem(movimento.item);

  const saldoAtual = obterSaldoItem(
    itemNormalizado,
    movimento.categoria
  );

  if (
    movimento.tipoMovimento === "saida" &&
    movimento.quantidade > saldoAtual
  ) {
    throw new Error(
      `Estoque insuficiente para "${itemNormalizado}". ` +
      `Disponível: ${saldoAtual} ${movimento.unidade}.`
    );
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO estoque (
      id,
      item,
      categoria,
      quantidade,
      unidade,
      tipo_movimento,
      referencia_id,
      data_movimento
    )
    VALUES (
      @id,
      @item,
      @categoria,
      @quantidade,
      @unidade,
      @tipo_movimento,
      @referencia_id,
      @data_movimento
    )
  `).run({
    id,
    item: itemNormalizado,
    categoria: movimento.categoria,
    quantidade: movimento.quantidade,
    unidade: movimento.unidade.trim(),
    tipo_movimento: movimento.tipoMovimento,
    referencia_id: movimento.referenciaId ?? null,
    data_movimento: movimento.dataMovimento,
  });

  const saldoDepois =
    movimento.tipoMovimento === "entrada"
      ? saldoAtual + movimento.quantidade
      : saldoAtual - movimento.quantidade;

  return {
    id,
    ...movimento,
    item: itemNormalizado,
    saldoAnterior: saldoAtual,
    saldoAtual: saldoDepois,
  };
}

export function listarEstoque(): SaldoEstoque[] {
  return db
    .prepare(`
      SELECT
        LOWER(TRIM(item)) AS item,
        categoria,
        unidade,
        SUM(
          CASE
            WHEN tipo_movimento = 'entrada' THEN quantidade
            WHEN tipo_movimento = 'saida' THEN -quantidade
            ELSE 0
          END
        ) AS saldo
      FROM estoque
      GROUP BY LOWER(TRIM(item)), categoria, unidade
      HAVING saldo <> 0
      ORDER BY categoria, item
    `)
    .all() as SaldoEstoque[];
}

export function listarMovimentosEstoque() {
  return db
    .prepare(`
      SELECT
        id,
        LOWER(TRIM(item)) AS item,
        categoria,
        quantidade,
        unidade,
        tipo_movimento,
        referencia_id,
        data_movimento,
        criado_em
      FROM estoque
      ORDER BY data_movimento DESC, criado_em DESC
    `)
    .all();
}