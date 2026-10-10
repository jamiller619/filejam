export interface ScanStatus {
  state: 'idle' | 'scanning' | 'completed' | 'cancelled' | 'failed'
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
 * Directories and symlinks are indexed in SQLite but excluded from these lists.
 */
export interface ScanResults {
  added: string[]
  changed: string[]
  removed: string[]
}

export interface ScannerApi {
  /** Acknowledge the start; poll status() to learn when the scan finishes. */
  start(root: string): Promise<ScanStatus>
  status(): Promise<ScanStatus>
  results(): Promise<ScanResults>
  /** Request cancellation; the returned snapshot may still say scanning. */
  cancel(): Promise<ScanStatus>
}

// Request IDs correlate replies across the worker boundary. A request error
// rejects that call; a background scan error is instead reported in ScanStatus.
export type ScannerRequest = {
  id: number
  method: keyof ScannerApi
  root?: string
}
export type ScannerResponse =
  | { id: number; result: ScanStatus | ScanResults }
  | { id: number; error: string }
