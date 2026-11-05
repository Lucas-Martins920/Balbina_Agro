import Database from "better-sqlite3";
import path from "path";

const databasePath =
  process.env.DB_PATH ||
  path.join(process.cwd(), "balbina_v1.db");

const db = new Database(databasePath);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS lotes (
    id TEXT PRIMARY KEY,
    especie TEXT NOT NULL,
    tanque_id TEXT NOT NULL,
    data_inicio TEXT NOT NULL,
    estoque_inicial INTEGER NOT NULL,
    unidade TEXT,
    observacoes TEXT,
    manejo_json TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insumos (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    descricao TEXT,
    quantidade REAL NOT NULL,
    unidade TEXT,
    preco_unitario REAL,
    fornecedor TEXT,
    tanque_id TEXT,
    lote_id TEXT,
    data_compra TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS caixa (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    valor REAL NOT NULL,
    descricao TEXT,
    referencia_id TEXT,
    data_movimento TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendas (
    id TEXT PRIMARY KEY,
    lote_id TEXT NOT NULL,
    data_venda TEXT NOT NULL,
    kg_vendidos REAL NOT NULL,
    valor_total REAL NOT NULL,
    comprador TEXT,
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lote_id) REFERENCES lotes(id)
  );

  CREATE TABLE IF NOT EXISTS contas_pagar (
    id TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    fornecedor TEXT,
    valor REAL NOT NULL,
    vencimento TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta',
    pago_em TEXT,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS estoque (
    id TEXT PRIMARY KEY,
    item TEXT NOT NULL,
    categoria TEXT NOT NULL,
    quantidade REAL NOT NULL,
    unidade TEXT NOT NULL,
    tipo_movimento TEXT NOT NULL,
    referencia_id TEXT,
    data_movimento TEXT NOT NULL,
    criado_em TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created
    ON sync_queue(status, created_at);

  CREATE INDEX IF NOT EXISTS idx_vendas_lote
    ON vendas(lote_id);

  CREATE INDEX IF NOT EXISTS idx_contas_vencimento
    ON contas_pagar(vencimento, status);

  CREATE INDEX IF NOT EXISTS idx_estoque_item
    ON estoque(item, categoria);
`);

function tableHasColumn(
  tableName: string,
  columnName: string
): boolean {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

function addColumnIfMissing(
  tableName: string,
  columnName: string,
  definition: string
): void {
  if (!tableHasColumn(tableName, columnName)) {
    db.exec(`
      ALTER TABLE ${tableName}
      ADD COLUMN ${columnName} ${definition}
    `);
  }
}

addColumnIfMissing(
  "lotes",
  "status",
  "TEXT NOT NULL DEFAULT 'ativo'"
);

addColumnIfMissing(
  "lotes",
  "data_fechamento",
  "TEXT"
);

addColumnIfMissing(
  "lotes",
  "kg_colhidos",
  "REAL"
);

addColumnIfMissing(
  "lotes",
  "custo_total",
  "REAL"
);

addColumnIfMissing(
  "lotes",
  "custo_por_kg",
  "REAL"
);

addColumnIfMissing(
  "caixa",
  "lote_id",
  "TEXT"
);

addColumnIfMissing(
  "insumos",
  "lote_id",
  "TEXT"
);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_lotes_status
    ON lotes(status);

  CREATE INDEX IF NOT EXISTS idx_caixa_lote
    ON caixa(lote_id);

  CREATE INDEX IF NOT EXISTS idx_insumos_lote
    ON insumos(lote_id);
`);

export default db;