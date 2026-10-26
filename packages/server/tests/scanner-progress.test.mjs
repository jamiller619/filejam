import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { mock } from 'node:test'
import { closeLogger, initLogger } from '../dist/logger.js'
import { ScanProgressReporter } from '../dist/scanner/progress.js'

test('global logs use cumulative work and wall-clock throughput, throttle heartbeats, and reset between runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-progress-'))
  let now = 0
  const clock = mock.method(performance, 'now', () => now)

  const state = (root, processed, total, state = 'scanning') => ({
    root,
    processed,
    total,
    state,
    phase: state === 'scanning' ? 'checking' : 'idle',
    error: null,
  })

  const progress = (status, added = 0, changed = 0, removed = 0) => ({
    type: 'progress',
    status,
    elapsedMs: 999999,
    entriesPerSecond: 999999,
    changes: { added, changed, removed },
  })

  const snapshot = (roots, active, queued = []) => ({
    state: active.length || queued.length ? 'scanning' : 'completed',
    phase: active.length ? 'checking' : 'idle',
    root: null,
    total: 0,
    processed: 0,
    error: null,
    roots,
    active,
    queued,
  })

  try {
    await initLogger({
      get: (key) =>
        ({
          'appdata.logsPath': directory,
          'log.level': 'info',
          'log.retentionDays': 1,
        })[key],
    })

    const reporter = new ScanProgressReporter()

    reporter.begin()

    let a = state('a', 10, 30)
    let b = state('b', 20, 40)

    reporter.update('a', progress(a, 5))
    reporter.update('b', progress(b, 6, 1))
    now = 1000
    reporter.report(snapshot([a, b], ['a', 'b'], ['c']))
    reporter.report(snapshot([a, b], ['a', 'b'], ['c'])) // Same global heartbeat is suppressed.
    a = state('a', 30, 30, 'completed')
    reporter.update('a', progress(a, 8))
    b = state('b', 40, 40, 'completed')
    reporter.update('b', progress(b, 10, 2, 1))

    // A watcher refresh starts while this busy period still has queued work.
    const refresh = state('a', 5, 5, 'completed')

    reporter.update('a', progress(refresh, 1))
    now = 2000
    reporter.report(snapshot([refresh, b], []))
    reporter.report(snapshot([refresh, b], [])) // Final snapshot is emitted once.
    reporter.begin()

    const fresh = state('c', 2, 2, 'completed')

    reporter.update('c', progress(fresh, 1))
    now = 3000
    reporter.report(snapshot([fresh], []))
    reporter.begin()

    const interrupted = state('d', 10, 20)

    reporter.update('d', progress(interrupted, 3))

    const failed = { ...interrupted, state: 'failed', error: 'worker exited' }

    reporter.failed('d', failed)
    reporter.failed('d', failed) // A later exit notification must not count it twice.
    now = 4000

    reporter.report({
      ...snapshot([failed], []),
      state: 'failed',
      error: failed.error,
    })

    await closeLogger()

    const logs = (await readFile(join(directory, 'current.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    assert.equal(logs.length, 4)
    assert.equal(logs[0].processed, 30)
    assert.equal(logs[0].total, 70)
    assert.equal(logs[0].added, 11)
    assert.equal(logs[0].elapsedMs, 1000)
    assert.equal(logs[0].entriesPerSecond, 30)
    assert.equal(logs[0].activeRoots, 2)
    assert.equal(logs[0].queuedRoots, 1)
    assert.equal(logs[1].processed, 75)
    assert.equal(logs[1].total, 75)
    assert.equal(logs[1].added, 19)
    assert.equal(logs[1].changed, 2)
    assert.equal(logs[1].removed, 1)
    assert.equal(logs[1].elapsedMs, 2000)
    assert.equal(logs[1].entriesPerSecond, 38)
    assert.equal(logs[2].processed, 2)
    assert.equal(logs[2].elapsedMs, 1000)
    assert.equal(logs[2].entriesPerSecond, 2)
    assert.equal(logs[3].processed, 10)
    assert.equal(logs[3].total, 20)
    assert.equal(logs[3].added, 3)
    assert.equal(logs[3].failedRoots, 1)
    assert.deepEqual(logs[3].errors, [{ root: 'd', error: 'worker exited' }])
    assert.ok(logs.every((log) => !('root' in log)))
  } finally {
    clock.mock.restore()
    await closeLogger()
    await rm(directory, { recursive: true, force: true })
  }
})
