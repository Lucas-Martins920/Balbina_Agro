import { Pool, PoolClient } from "pg";
import {
  getPendingBatch,
  incrementAttempts,
  markError,
  markSynced,
} from "../repositories/syncRepository";

type PostgresSyncWorkerOptions = {
  databaseUrl: string;
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
};

type SyncItem = {
  id: string;
  entity: string;
  operation: string;
  payload_json: string;
  attempts: number;
};

const entityTables: Record<string, string> = {
  lote: "lotes",
  insumo: "insumos",
  caixa: "caixa",
  venda: "vendas",
  estoque: "estoque",
  conta_pagar: "contas_pagar",
};

const columnAliases: Record<string, string> = {
  loteId: "lote_id",
  tanqueId: "tanque_id",
  dataInicio: "data_inicio",
  estoqueInicial: "estoque_inicial",
  manejo: "manejo_json",
  dataFechamento: "data_fechamento",
  kgColhidos: "kg_colhidos",
  custoTotal: "custo_total",
  custoPorKg: "custo_por_kg",
  insumoId: "id",
  descricao: "descricao",
  precoUnitario: "preco_unitario",
  dataCompra: "data_compra",
  dataVenda: "data_venda",
  referenciaId: "referencia_id",
  dataMovimento: "data_movimento",
  valorTotal: "valor_total",
  kgVendidos: "kg_vendidos",
  comprador: "comprador",
  tipoMovimento: "tipo_movimento",
  vencimento: "vencimento",
  pagoEm: "pago_em",
};

const allowedColumns: Record<string, Set<string>> = {
  lotes: new Set([
    "id", "especie", "tanque_id", "data_inicio", "estoque_inicial",
    "unidade", "observacoes", "manejo_json", "status", "data_fechamento",
    "kg_colhidos", "custo_total", "custo_por_kg",
  ]),
  insumos: new Set([
    "id", "tipo", "descricao", "quantidade", "unidade", "preco_unitario",
    "fornecedor", "tanque_id", "lote_id", "data_compra",
  ]),
  caixa: new Set([
    "id", "tipo", "valor", "descricao", "referencia_id", "lote_id",
    "data_movimento",
  ]),
  vendas: new Set([
    "id", "lote_id", "data_venda", "kg_vendidos", "valor_total", "comprador",
  ]),
  estoque: new Set([
    "id", "item", "categoria", "quantidade", "unidade", "tipo_movimento",
    "referencia_id", "data_movimento",
  ]),
  contas_pagar: new Set([
    "id", "descricao", "fornecedor", "valor", "vencimento", "status", "pago_em",
  ]),
};

export class PostgresSyncWorker {
  private readonly pool: Pool;
  private readonly options: Required<PostgresSyncWorkerOptions>;
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(options: PostgresSyncWorkerOptions) {
    this.options = {
      pollIntervalMs: 5000,
      batchSize: 10,
      maxAttempts: 5,
      ...options,
    };
    this.pool = new Pool({
      connectionString: this.options.databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log("[sync] PostgreSQL worker started");
    void this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await this.pool.end();
    console.log("[sync] PostgreSQL worker stopped");
  }

  private async loop(): Promise<void> {
    if (!this.running) return;
    try {
      await this.processBatch();
    } catch (error) {
      console.error("[sync] PostgreSQL loop error:", error);
    } finally {
      if (this.running) {
        this.timer = setTimeout(() => void this.loop(), this.options.pollIntervalMs);
      }
    }
  }

  private async processBatch(): Promise<void> {
    const items = getPendingBatch(this.options.batchSize, this.options.maxAttempts);
    if (items.length === 0) return;

    const client = await this.pool.connect();
    try {
      await this.ensureSchema(client);
      for (const item of items) {
        await this.processItem(client, item);
      }
    } finally {
      client.release();
    }
  }

  private async processItem(client: PoolClient, item: SyncItem): Promise<void> {
    try {
      const table = entityTables[item.entity];
      if (!table) throw new Error(`Entidade não suportada: ${item.entity}`);

      if (item.operation === "delete") {
        const payload = JSON.parse(item.payload_json) as Record<string, unknown>;
        const id = String(payload.id ?? "");
        if (!id) throw new Error("Operação delete sem id");
        await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      } else {
        const payload = JSON.parse(item.payload_json) as Record<string, unknown>;
        const record = this.toRecord(table, payload);
        const columns = Object.keys(record);
        if (!record.id || columns.length === 0) throw new Error("Payload de sincronização inválido");

        const values = columns.map((column) => record[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
        const updates = columns
          .filter((column) => column !== "id")
          .map((column) => `${column} = EXCLUDED.${column}`)
          .join(", ");

        await client.query(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
           ON CONFLICT (id) DO UPDATE SET ${updates || "id = EXCLUDED.id"}`,
          values,
        );
      }
      markSynced(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      incrementAttempts(item.id, message);
      if (item.attempts + 1 >= this.options.maxAttempts) {
        markError(item.id, `max attempts reached: ${message}`);
      }
    }
  }

  private toRecord(table: string, payload: Record<string, unknown>): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      const column = columnAliases[key] ?? key;
      if (!allowedColumns[table]?.has(column)) continue;
      record[column] = column === "manejo_json" ? JSON.stringify(value ?? {}) : value;
    }
    return record;
  }

  private async ensureSchema(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS lotes (
        id TEXT PRIMARY KEY, especie TEXT NOT NULL, tanque_id TEXT NOT NULL,
        data_inicio TEXT NOT NULL, estoque_inicial INTEGER NOT NULL, unidade TEXT,
        observacoes TEXT, manejo_json JSONB, status TEXT NOT NULL DEFAULT 'ativo',
        data_fechamento TEXT, kg_colhidos NUMERIC, custo_total NUMERIC, custo_por_kg NUMERIC
      );
      CREATE TABLE IF NOT EXISTS insumos (
        id TEXT PRIMARY KEY, tipo TEXT NOT NULL, descricao TEXT, quantidade NUMERIC NOT NULL,
        unidade TEXT, preco_unitario NUMERIC, fornecedor TEXT, tanque_id TEXT, lote_id TEXT,
        data_compra TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS caixa (
        id TEXT PRIMARY KEY, tipo TEXT NOT NULL, valor NUMERIC NOT NULL, descricao TEXT,
        referencia_id TEXT, lote_id TEXT, data_movimento TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vendas (
        id TEXT PRIMARY KEY, lote_id TEXT NOT NULL, data_venda TEXT NOT NULL,
        kg_vendidos NUMERIC NOT NULL, valor_total NUMERIC NOT NULL, comprador TEXT
      );
      CREATE TABLE IF NOT EXISTS estoque (
        id TEXT PRIMARY KEY, item TEXT NOT NULL, categoria TEXT NOT NULL, quantidade NUMERIC NOT NULL,
        unidade TEXT NOT NULL, tipo_movimento TEXT NOT NULL, referencia_id TEXT, data_movimento TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contas_pagar (
        id TEXT PRIMARY KEY, descricao TEXT NOT NULL, fornecedor TEXT, valor NUMERIC NOT NULL,
        vencimento TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aberta', pago_em TEXT
      );
    `);
  }
}