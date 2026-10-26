import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApi } from '../dist/api/index.js'
import { initDatabase } from '../dist/db/index.js'
import { volumes } from '../dist/db/schemas/volume.js'

test('volumes are registered, refreshed, and removed with stable records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-volumes-api-'))
  let connection

  try {
    connection = await initDatabase(join(directory, 'filejam.sqlite'))
    const api = createApi(connection.db)

    assert.deepEqual(await api.volumes.list(), [])

    await api.volumes.sync([
      { name: 'System', rootPath: '/system', kind: 'system' },
      { name: 'USB', rootPath: '/usb', kind: 'removable' },
    ])

    const registered = await api.volumes.list()

    assert.deepEqual(
      registered.map(({ name, rootPath, kind }) => ({ name, rootPath, kind })),
      [
        { name: 'System', rootPath: '/system', kind: 'system' },
        { name: 'USB', rootPath: '/usb', kind: 'removable' },
      ],
    )

    const systemId = registered[0].id

    await api.volumes.sync([
      { name: 'Computer', rootPath: '/system', kind: 'system' },
    ])

    const refreshed = await api.volumes.list()

    assert.equal(refreshed.length, 1)
    assert.equal(refreshed[0].id, systemId)
    assert.equal(refreshed[0].name, 'Computer')
    assert.equal((await connection.db.select().from(volumes)).length, 1)
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
