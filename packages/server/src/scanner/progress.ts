import { createLogger } from '../logger.js'
import type { ScannerStatus, ScanProgress, ScanStatus } from './types.js'

const totals = () => ({
  total: 0,
  processed: 0,
  added: 0,
  changed: 0,
  removed: 0,
})

/** One wall-clock throughput and cumulative work count for a pool's busy period. */
export class ScanProgressReporter {
  readonly #active = new Map<string, ScanProgress>()
  #finished = totals()
  #startedAt: number | undefined
  #lastLoggedAt = -Infinity
  #lastPhase: ScanStatus['phase'] = 'idle'

  begin() {
    this.#active.clear()
    this.#finished = totals()
    this.#startedAt = performance.now()
    this.#lastLoggedAt = -Infinity
    this.#lastPhase = 'idle'
  }

  update(root: string, progress: ScanProgress) {
    if (progress.status.state === 'scanning') {
      this.#active.set(root, progress)
    } else {
      this.#finished.total += progress.status.total
      this.#finished.processed += progress.status.processed
      this.#finished.added += progress.changes.added
      this.#finished.changed += progress.changes.changed
      this.#finished.removed += progress.changes.removed
      this.#active.delete(root)
    }
  }

  failed(root: string, status: ScanStatus) {
    const previous = this.#active.get(root)

    // A terminal snapshot may already have accounted for this scan before the crash.
    if (!previous) {
      return
    }

    this.update(root, {
      type: 'progress',
      status,
      elapsedMs: 0,
      entriesPerSecond: 0,
      changes: previous.changes,
    })
  }

  report(status: ScannerStatus) {
    if (this.#startedAt === undefined) {
      return
    }

    const now = performance.now()
    const scanning = status.state === 'scanning'

    // Worker heartbeats can arrive together; emit one global heartbeat per second.
    // Also publish phase transitions and a single final snapshot.
    if (
      scanning &&
      now - this.#lastLoggedAt < 1000 &&
      status.phase === this.#lastPhase
    ) {
      return
    }

    const aggregate = { ...this.#finished }

    for (const progress of this.#active.values()) {
      aggregate.total += progress.status.total
      aggregate.processed += progress.status.processed
      aggregate.added += progress.changes.added
      aggregate.changed += progress.changes.changed
      aggregate.removed += progress.changes.removed
    }

    const elapsedMs = Math.round(now - this.#startedAt)

    const errors = status.roots.flatMap((root) =>
      root.error ? [{ root: root.root, error: root.error }] : [],
    )

    const logger = createLogger('scanner')

    logger[status.state === 'failed' ? 'error' : 'info'](
      scanning ? 'Scan progress' : `Scan ${status.state}`,
      {
        state: status.state,
        phase: status.phase,
        ...aggregate,
        elapsedMs,
        entriesPerSecond:
          elapsedMs > 0
            ? Math.round((aggregate.processed * 1000) / elapsedMs)
            : 0,
        activeRoots: status.active.length,
        queuedRoots: status.queued.length,
        completedRoots: status.roots.filter(
          (root) => root.state === 'completed',
        ).length,
        failedRoots: status.roots.filter((root) => root.state === 'failed')
          .length,
        cancelledRoots: status.roots.filter(
          (root) => root.state === 'cancelled',
        ).length,
        error: status.error,
        errors,
      },
    )

    this.#lastLoggedAt = now
    this.#lastPhase = status.phase

    if (!scanning) {
      this.#startedAt = undefined
    }
  }
}
