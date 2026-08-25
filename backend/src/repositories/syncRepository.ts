import db from "../db";
import { v4 as uuidv4 } from "uuid";
import { SyncQueueRow } from "../types/sync";

export function enqueueOperation(entity: string, operation: string, payload: any, id?: string) {
  const rowId = id ?? uuidv4();

  const stmt = db.prepare(`
    INSERT INTO sync_queue (id, entity, operation, payload_json, status, attempts)
    VALUES (@id, @entity, @operation, @payload_json, 'pending', 0)
  `);

  stmt.run({
    id: rowId,
    entity,
    operation,
    payload_json: JSON.stringify(payload),
  });

  return rowId;
}

export function getPendingBatch(limit = 20, maxAttempts = 5): SyncQueueRow[] {
  const stmt = db.prepare(`
    SELECT *
    FROM sync_queue
    WHERE status = 'pending'
      AND attempts < @maxAttempts
    ORDER BY created_at ASC
    LIMIT @limit
  `);

  return stmt.all({ limit, maxAttempts });
}

export function incrementAttempts(id: string, errorMessage?: string) {
  const stmt = db.prepare(`
    UPDATE sync_queue
    SET attempts = attempts + 1,
        last_error = @last_error,
        updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({
    id,
    last_error: errorMessage ?? null,
  });
}

export function markSynced(id: string) {
  const stmt = db.prepare(`
    UPDATE sync_queue
    SET status = 'synced',
        updated_at = datetime('now'),
        last_error = NULL
    WHERE id = @id
  `);

  stmt.run({ id });
}

export function markError(id: string, errorMessage: string) {
  const stmt = db.prepare(`
    UPDATE sync_queue
    SET status = 'error',
        last_error = @last_error,
        updated_at = datetime('now')
    WHERE id = @id
  `);

  stmt.run({ id, last_error: errorMessage });
}

export function getQueueSummary() {
  const stmt = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error
    FROM sync_queue
  `);

  return stmt.get();
}