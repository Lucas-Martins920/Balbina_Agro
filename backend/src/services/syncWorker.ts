import fetch from "node-fetch";
import {
  getPendingBatch,
  incrementAttempts,
  markSynced,
  markError,
} from "../repositories/syncRepository";

type SyncWorkerOptions = {
  remoteBaseUrl: string;
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  conflictStrategy?: "client_wins" | "server_wins";
};

export class SyncWorker {
  private opts: Required<SyncWorkerOptions>;
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(opts: SyncWorkerOptions) {
    this.opts = {
      pollIntervalMs: 5000,
      batchSize: 10,
      maxAttempts: 5,
      conflictStrategy: "client_wins",
      ...opts,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[sync] worker started for ${this.opts.remoteBaseUrl}`);
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    console.log("[sync] worker stopped");
  }

  private async loop() {
    if (!this.running) return;

    try {
      await this.processOnce();
    } catch (err: any) {
      console.error("[sync] loop error:", err?.message ?? err);
    } finally {
      this.timer = setTimeout(() => this.loop(), this.opts.pollIntervalMs);
    }
  }

  private async isOnline(): Promise<boolean> {
    try {
      const res = await fetch(this.opts.remoteBaseUrl, {
        method: "HEAD",
        timeout: 3000,
      } as any);

      if (res.ok || res.status === 405) {
        return true;
      }

      return false;
    } catch (err) {
      return false;
    }
  }

  private remoteEndpointFor(entity: string) {
    if (entity === "lote") return `${this.opts.remoteBaseUrl}/lotes`;
    if (entity === "insumo") return `${this.opts.remoteBaseUrl}/insumos`;
    if (entity === "caixa") return `${this.opts.remoteBaseUrl}/caixa`;
    return `${this.opts.remoteBaseUrl}/${entity}`;
  }

  private async processOnce() {
    const online = await this.isOnline();

    if (!online) {
      console.log("[sync] offline; waiting for reconnect");
      return;
    }

    const items = getPendingBatch(this.opts.batchSize, this.opts.maxAttempts);

    if (items.length === 0) {
      return;
    }

    console.log(`[sync] processing ${items.length} pending item(s)`);

    for (const item of items) {
      try {
        const endpoint = this.remoteEndpointFor(item.entity);
        const payload = JSON.parse(item.payload_json);

        const idInPayload =
          payload.id ??
          payload[Object.keys(payload).find((k) => k.toLowerCase().endsWith("id")) as string];

        const url =
          item.operation === "update" && idInPayload
            ? `${endpoint}/${idInPayload}`
            : endpoint;

        const method =
          item.operation === "delete"
            ? "DELETE"
            : item.operation === "update"
              ? "PUT"
              : "POST";

        console.log(`[sync] trying ${item.entity}:${item.id} -> ${method} ${url}`);

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "DELETE" ? undefined : JSON.stringify(payload),
        });

        if (res.ok) {
          markSynced(item.id);
          console.log(`[sync] synced ${item.entity}:${item.id}`);
          continue;
        }

        if (res.status === 409) {
          const serverBody = await res.json().catch(() => null);
          const resolved = await this.resolveConflict(item, serverBody);

          if (resolved === "synced") {
            markSynced(item.id);
            console.log(`[sync] conflict resolved by client_wins -> synced ${item.entity}:${item.id}`);
            continue;
          }

          if (resolved === "retry") {
            incrementAttempts(item.id, "conflict retry");
            console.warn(`[sync] conflict retry ${item.entity}:${item.id}`);
            continue;
          }

          markError(item.id, "conflict unresolved");
          console.error(`[sync] conflict unresolved ${item.entity}:${item.id}`);
          continue;
        }

        const text = await res.text().catch(() => `status ${res.status}`);
        incrementAttempts(item.id, text);

        if (item.attempts + 1 >= this.opts.maxAttempts) {
          markError(item.id, `max attempts reached: ${text}`);
          console.error(`[sync] max attempts reached ${item.entity}:${item.id} -> ${text}`);
        } else {
          console.warn(`[sync] fail ${item.entity}:${item.id} -> ${text}`);
        }
      } catch (err: any) {
        incrementAttempts(item.id, err?.message ?? String(err));

        if (item.attempts + 1 >= this.opts.maxAttempts) {
          markError(item.id, err?.message ?? String(err));
          console.error(`[sync] failed permanently ${item.entity}:${item.id}`, err?.message ?? err);
        } else {
          console.warn(`[sync] retrying later ${item.entity}:${item.id}`, err?.message ?? err);
        }
      }
    }
  }

  private async resolveConflict(
    item: { id: string; entity: string; operation: string; payload_json: string },
    serverBody: any
  ): Promise<"synced" | "retry" | "failed" | "unresolved"> {
    if (this.opts.conflictStrategy === "client_wins") {
      try {
        const endpoint = this.remoteEndpointFor(item.entity);
        const payload = JSON.parse(item.payload_json);
        const idInPayload =
          payload.id ??
          payload[Object.keys(payload).find((k) => k.toLowerCase().endsWith("id")) as string];

        const res = await fetch(`${endpoint}/${idInPayload}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          return "synced";
        }

        return "retry";
      } catch {
        return "retry";
      }
    }

    if (this.opts.conflictStrategy === "server_wins") {
      return "synced";
    }

    return "unresolved";
  }
}