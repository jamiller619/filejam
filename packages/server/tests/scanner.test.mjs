import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { FileScanner } from '../dist/scanner/index.js'

async function finished(scanner) {
  for (let i = 0; i < 500; i++) {
    const status = await scanner.status()
    if (status.state !== 'scanning') return status
    await setTimeout(10)
  }
  throw new Error('Scan timed out')
}

test('worker scans, persists changes, rejects overlap, and handles failure and cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-scanner-'))
  const root = join(directory, 'root')
  const cache = join(root, '.cache')
  await mkdir(root)
  let scanner = new FileScanner(cache, join(directory, 'files.sqlite'))
  try {
    await writeFile(join(root, 'a.txt'), 'a')
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
    await scanner.start(root)
    await assert.rejects(scanner.start(root), /already running/)
    await scanner.cancel()
    assert.equal((await finished(scanner)).state, 'cancelled')
    await scanner.start(root)
    assert.equal((await finished(scanner)).state, 'completed')
    assert.equal((await scanner.results()).added.length, 300)
    await scanner.close()
    await assert.rejects(scanner.status(), /closed/)
  } finally {
    await scanner.close()
    await rm(directory, { recursive: true, force: true })
  }
})
