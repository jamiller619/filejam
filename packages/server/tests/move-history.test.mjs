import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApi } from '../dist/api/index.js'
import { initDatabase } from '../dist/db/index.js'

test('move history preserves completed and interrupted operations across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'move-history-'))
  const databasePath = join(directory, 'filejam.sqlite')
  let connection

  try {
    connection = await initDatabase(databasePath)
    let api = createApi(connection.db)

    const completed = await api.moveHistory.plan([
      { sourcePath: '/volume/one', targetPath: '/volume/archive/one' },
      { sourcePath: '/volume/two', targetPath: '/volume/archive/two' },
    ])

    await api.moveHistory.markItemMoved(completed.items[0].id)
    await api.moveHistory.markItemMoved(completed.items[1].id)
    await api.moveHistory.complete(completed.id)

    const interrupted = await api.moveHistory.plan([
      {
        sourcePath: '/volume/three',
        targetPath: '/volume/archive/three',
      },
    ])

    await api.moveHistory.fail(interrupted.id, new Error('disk unavailable'))

    connection.close()
    connection = await initDatabase(databasePath)
    api = createApi(connection.db)

    const history = await api.moveHistory.list()

    assert.equal(history.length, 2)
    assert.equal(history[0].id, interrupted.id)
    assert.equal(history[0].status, 'failed')
    assert.equal(history[0].error, 'disk unavailable')
    assert.equal(history[0].items[0].status, 'pending')

    assert.equal(history[1].id, completed.id)
    assert.equal(history[1].status, 'completed')
    assert.deepEqual(
      history[1].items.map((item) => ({
        sourcePath: item.sourcePath,
        targetPath: item.targetPath,
        status: item.status,
      })),
      [
        {
          sourcePath: '/volume/one',
          targetPath: '/volume/archive/one',
          status: 'completed',
        },
        {
          sourcePath: '/volume/two',
          targetPath: '/volume/archive/two',
          status: 'completed',
        },
      ],
    )
  } finally {
    connection?.close()
    await rm(directory, {
      recursive: true,
      force: true,
    }).catch((error) => {
      if (error.code !== 'EBUSY') {
        throw error
      }
    })
  }
})
