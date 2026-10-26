import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApi } from '../dist/api/index.js'
import { initDatabase } from '../dist/db/index.js'

test('folder contents are read directly from a mounted volume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-folder-'))
  const rootPath = join(directory, 'volume')
  let connection

  try {
    await mkdir(join(rootPath, 'nested'), { recursive: true })
    await writeFile(join(rootPath, 'example.txt'), 'hello')
    await writeFile(join(rootPath, 'nested', 'child.txt'), 'world')

    connection = await initDatabase(join(directory, 'filejam.sqlite'))

    const api = createApi(connection.db)
    const volume = await api.volumes.ensure({
      name: 'Test volume',
      rootPath,
      kind: 'internal',
    })
    const root = await api.entries.listChildren({
      volumeId: volume.id,
      relativePath: '',
    })

    assert.equal(root.scanned, true)
    assert.deepEqual(
      root.entries.map(({ name, kind }) => ({ name, kind })),
      [
        { name: 'nested', kind: 'directory' },
        { name: 'example.txt', kind: 'file' },
      ],
    )

    const nested = await api.entries.listChildren({
      volumeId: volume.id,
      relativePath: 'nested',
    })

    assert.deepEqual(
      nested.entries.map((entry) => entry.name),
      ['child.txt'],
    )
    assert.ok(nested.entries[0].id > 0)
  } finally {
    await connection?.close()
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})

test('folder references reject paths outside their volume', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-folder-security-'))
  let connection

  try {
    connection = await initDatabase(join(directory, 'filejam.sqlite'))
    const api = createApi(connection.db)
    const volume = await api.volumes.ensure({
      name: 'Test volume',
      rootPath: directory,
      kind: 'internal',
    })

    await assert.rejects(
      () =>
        api.entries.listChildren({
          volumeId: volume.id,
          relativePath: '../outside',
        }),
      /outside its volume/,
    )
  } finally {
    await connection?.close()
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})
