import db from "../db";
import { v4 as uuidv4 } from "uuid";

export type NovaConta = {
  descricao: string;
  fornecedor?: string | null;
  valor: number;
  vencimento: string;
};

export function inserirConta(conta: NovaConta) {
  const id = uuidv4();

  db.prepare(`
    INSERT INTO contas_pagar (
      id,
      descricao,
      fornecedor,
      valor,
      vencimento,
      status
    )
    VALUES (
      @id,
      @descricao,
      @fornecedor,
      @valor,
      @vencimento,
      'aberta'
    )
  `).run({
    id,
    descricao: conta.descricao,
    fornecedor: conta.fornecedor ?? null,
    valor: conta.valor,
    vencimento: conta.vencimento,
  });

  return {
    id,
    ...conta,
    status: "aberta",
  };
}

export function listarContas() {
  return db
    .prepare(`
      SELECT
        id,
        descricao,
        fornecedor,
        valor,
        vencimento,
        status,
        pago_em,
        criado_em
      FROM contas_pagar
      ORDER BY vencimento ASC, criado_em DESC
    `)
    .all();
}

export function listarAlertasContas(dias = 7) {
  return db
    .prepare(`
      SELECT
        id,
        descricao,
        fornecedor,
        valor,
        vencimento,
        status,
        CAST(
          julianday(vencimento) - julianday(date('now'))
          AS INTEGER
        ) AS dias_restantes
      FROM contas_pagar
      WHERE status = 'aberta'
        AND date(vencimento) <= date('now', '+' || @dias || ' day')
      ORDER BY vencimento ASC
    `)
    .all({ dias });
}

export function contaExiste(id: string): boolean {
  const conta = db
    .prepare(`
      SELECT id
      FROM contas_pagar
      WHERE id = @id
    `)
    .get({ id }) as { id?: string } | undefined;

  return Boolean(conta?.id);
}

export function pagarConta(id: string, pagoEm: string) {
  const result = db
    .prepare(`
      UPDATE contas_pagar
      SET
        status = 'paga',
        pago_em = @pagoEm
      WHERE id = @id
        AND status = 'aberta'
    `)
    .run({
      id,
      pagoEm,
    });

  return result.changes > 0;
}