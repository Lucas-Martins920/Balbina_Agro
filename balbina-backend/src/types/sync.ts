export type SyncStatus = "pending" | "synced" | "error";

export type SyncQueueRow = {
  id: string;
  entity: string;
  operation: string;
  payload_json: string;
  status: SyncStatus;
  attempts: number;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
};