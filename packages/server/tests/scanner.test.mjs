import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { closeLogger, initLogger } from '../dist/logger.js'
import { FileScanner } from '../dist/scanner/index.js'

async function finished(scanner) {
  for (let i = 0; i < 2000; i++) {
    const status = await scanner.status()

    if (status.state !== 'scanning') {
      return status
    }

    await setTimeout(10)
  }

  throw new Error('Scan timed out')
}

test('worker scans, persists changes, rejects overlap, and handles failure and cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-scanner-'))
  const root = join(directory, 'root')
  const cache = join(root, '.cache')

  await mkdir(root)

  await initLogger({
    get: (key) =>
      ({
        'appdata.logsPath': join(directory, 'logs'),
        'log.level': 'info',
        'log.retentionDays': 1,
      })[key],
  })

  let scanner = new FileScanner(cache, join(directory, 'files.sqlite'))

  try {
    await writeFile(join(root, 'a.txt'), 'a')
    await writeFile(join(root, 'desktop.ini'), 'Windows shell metadata')
    await writeFile(join(root, 'THUMBS.DB'), 'Windows thumbnail metadata')
    await writeFile(join(root, '.DS_Store'), 'macOS metadata')
    await mkdir(join(root, '.hidden'))
    await writeFile(join(root, '.hidden', 'private.txt'), 'hidden')
    await scanner.start(root)
    assert.equal((await finished(scanner)).state, 'completed')

    assert.deepEqual(await scanner.results(), {
      added: ['a.txt'],
      changed: [],
      removed: [],
    })

    await scanner.close()
    scanner = new FileScanner(cache, join(directory, 'files.sqlite'))
    await scanner.start(root)
    assert.equal((await finished(scanner)).state, 'completed')

    assert.deepEqual(await scanner.results(), {
      added: [],
      changed: [],
      removed: [],
    })

    await writeFile(join(root, 'a.txt'), 'longer')
    await writeFile(join(root, 'b.txt'), 'b')
    await scanner.start(root)
    await finished(scanner)

    assert.deepEqual(await scanner.results(), {
      added: ['b.txt'],
      changed: ['a.txt'],
      removed: [],
    })

    await rm(join(root, 'a.txt'))
    await scanner.start(root)
    await finished(scanner)
    assert.deepEqual((await scanner.results()).removed, ['a.txt'])
    await scanner.start(join(root, 'missing'))
    assert.equal((await finished(scanner)).state, 'failed')

    await Promise.all(
      Array.from({ length: 300 }, (_, i) =>
        writeFile(join(root, `${i}.txt`), 'x'),
      ),
    )

    await scanner.startAll([root, join(root, 'should-not-run')])
    await assert.rejects(scanner.start(root), /already running/)
    await scanner.cancel()
    assert.equal((await finished(scanner)).state, 'cancelled')
    await setTimeout(50)
    assert.equal((await scanner.status()).state, 'cancelled')
    await scanner.start(root)
    assert.equal((await finished(scanner)).state, 'completed')
    assert.equal((await scanner.results()).added.length, 300)
    await scanner.close()
    await assert.rejects(scanner.status(), /closed/)
    await closeLogger()

    const logs = (await readFile(join(directory, 'logs/current.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.component === 'scanner')

    assert.ok(
      logs.some(
        (entry) => entry.msg === 'Scan progress' && entry.phase === 'crawling',
      ),
    )

    assert.ok(
      logs.some(
        (entry) =>
          entry.msg === 'Scan progress' &&
          entry.phase === 'checking' &&
          entry.total === 2,
      ),
    )

    const completed = logs.find((entry) => entry.msg === 'Scan completed')

    assert.equal(completed.processed, 2)
    assert.equal(completed.total, 2)
    assert.equal(completed.added, 1)
    assert.equal(completed.changed, 0)
    assert.equal(completed.removed, 0)
    assert.ok(completed.elapsedMs >= 0)
    assert.ok(Number.isFinite(completed.entriesPerSecond))

    assert.ok(
      logs.some(
        (entry) =>
          entry.msg === 'Scan failed' && entry.level === 'error' && entry.error,
      ),
    )

    assert.ok(logs.some((entry) => entry.msg === 'Scan cancelled'))
  } finally {
    await scanner.close()
    await closeLogger()
    await rm(directory, { recursive: true, force: true })
  }
})
