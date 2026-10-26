export interface ScanStatus {
  state: 'idle' | 'queued' | 'scanning' | 'completed' | 'cancelled' | 'failed'
  root: string | null
  phase: 'idle' | 'crawling' | 'checking'
  /** Entries (including directories and the root); known after crawling finishes. */
  total: number
  /** Entries saved to the database during the checking phase. */
  processed: number
  error: string | null
}

/**
 * File changes relative to the persisted cache baseline, using root-relative paths
 * with native separators. Empty until a scan completes; reset on each start.
 * Directories are indexed in SQLite but excluded from these lists. Symbolic
 * links are followed and reported according to the kind of their targets.
 */
export interface ScanResults {
  added: string[]
  changed: string[]
  removed: string[]
}

export interface ScannerStatus extends ScanStatus {
  roots: ScanStatus[]
  active: string[]
  queued: string[]
}

export interface WorkerApi {
  /** Acknowledge the start; poll status() to learn when the scan finishes. */
  start(root: string): Promise<ScanStatus>
  status(): Promise<ScanStatus>
  results(): Promise<ScanResults>
  /** Request cancellation; the returned snapshot may still say scanning. */
  cancel(): Promise<ScanStatus>
}

export interface ScannerApi
  extends Omit<WorkerApi, 'status' | 'cancel' | 'results'> {
  status(): Promise<ScannerStatus>
  cancel(): Promise<ScannerStatus>
  /** Results for a canonical root, or the most recently explicitly requested root. */
  results(root?: string): Promise<ScanResults>
}

// Request IDs correlate replies across the worker boundary. A request error
// rejects that call; a background scan error is instead reported in ScanStatus.
export type ScannerRequest = {
  id: number
  method: keyof WorkerApi | 'shutdown' | 'initialize'
  root?: string
}

export type ScannerResponse =
  | { id: number; result: ScanStatus | ScanResults }
  | { id: number; error: string }

// Unsolicited snapshots let the parent log progress without polling the worker.
export type ScanProgress = {
  type: 'progress'
  status: ScanStatus
  elapsedMs: number
  entriesPerSecond: number
  changes: { added: number; changed: number; removed: number }
}
