import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  createBenchmarkFixture,
  expectedBenchmarkNames,
  statistics,
} from './browser-fixtures.mjs'

test('statistics preserve all samples and use nearest-rank p95', () => {
  assert.deepEqual(statistics([]), { count: 0, median: null, p95: null })
  assert.equal(statistics([1, 2, 3, 4]).median, 2.5)
  assert.equal(statistics(Array.from({ length: 10 }, (_, i) => i + 1)).p95, 10)
  assert.equal(statistics(Array.from({ length: 20 }, (_, i) => i + 1)).p95, 19)
})

test('benchmark fixture has exact immediate directory/file counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-bench-test-'))
  try {
    const root = await createBenchmarkFixture(directory, 1000)
    const entries = await readdir(root, { withFileTypes: true })
    assert.equal(entries.filter((entry) => entry.isDirectory()).length, 100)
    assert.equal(entries.filter((entry) => entry.isFile()).length, 900)
    const names = expectedBenchmarkNames(1000, {
      nameContains: '',
      sortDirection: 'asc',
    })
    assert.equal(names[0], 'dir-000000')
    assert.equal(names.at(-1), 'file-000999')
    assert.deepEqual(
      entries.map((entry) => entry.name).sort(),
      [...names].sort(),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
