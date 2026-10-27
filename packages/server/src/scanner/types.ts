export interface ScanStatus {
  state: 'idle' | 'queued' | 'scanning' | 'completed' | 'cancelled' | 'failed'
  root: string | null
  phase: 'idle' | 'crawling' | 'checking'
  /** Entries discovered so far, including directories and the root. */
  total: number
  /** Whether total is final and can drive determinate progress. */
  totalKnown: boolean
  /** Discovered entries checked and saved or confirmed unchanged. */
  processed: number
  /** Why the native fast path fell back to directory traversal, if applicable. */
  fallbackReason?: string
  error: string | null
}

/**
 * File changes relative to the SQLite baseline, using root-relative paths with
 * native separators. Populated only when collectChangePaths is enabled; production
 * scans retain counts in progress events instead. Directories are excluded.
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
  start(root: string, scanPath?: string): Promise<ScanStatus>
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
  scanPath?: string
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
