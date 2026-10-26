import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createMoveFoldersHandler } from '../dist/api/moveFolders.js'

test('moves folders into indexed destinations and updates nested favorites', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'move-folders-'))

  try {
    const volume = join(directory, 'volume')
    const source = join(volume, 'source')
    const nested = join(source, 'nested')
    const destination = join(volume, 'destination')

    await mkdir(nested, { recursive: true })
    await mkdir(destination)
    await writeFile(join(nested, 'note.txt'), 'hello')

    let favorites = [nested]
    const scans = []
    const history = []
    const settings = {
      get: async () => favorites,
      set: async (_key, value) => {
        favorites = value
      },
    }
    const move = createMoveFoldersHandler(
      {
        volumes: {
          list: async () => [{ rootPath: volume, isTrash: false }],
        },
        moveHistory: {
          plan: async (items) => {
            const operation = {
              id: 'operation',
              items: items.map((item, index) => ({
                ...item,
                id: `item-${index}`,
              })),
            }

            history.push(operation)

            return operation
          },
          markItemMoved: async (id) => {
            history[0].items.find((item) => item.id === id).completed = true
          },
          complete: async () => {
            history[0].completed = true
          },
          fail: async () => {},
        },
      },
      settings,
      async (root) => scans.push(root),
    )

    const updated = await move([source], destination)
    const movedSource = join(destination, 'source')

    assert.equal(
      await readFile(join(movedSource, 'nested', 'note.txt'), 'utf8'),
      'hello',
    )
    await assert.rejects(readFile(join(source, 'nested', 'note.txt')))
    assert.deepEqual(updated, [join(movedSource, 'nested')])
    assert.deepEqual(favorites, updated)
    assert.deepEqual(scans, [volume])
    assert.deepEqual(history, [
      {
        id: 'operation',
        completed: true,
        items: [
          {
            id: 'item-0',
            sourcePath: source,
            targetPath: movedSource,
            completed: true,
          },
        ],
      },
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('rejects unsafe moves before changing the filesystem', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'move-folders-'))

  try {
    const volume = join(directory, 'volume')
    const source = join(volume, 'source')
    const nested = join(source, 'nested')
    const destination = join(volume, 'destination')

    await mkdir(nested, { recursive: true })
    await mkdir(join(destination, 'source'), { recursive: true })

    const move = createMoveFoldersHandler(
      {
        volumes: {
          list: async () => [{ rootPath: volume, isTrash: false }],
        },
        moveHistory: {
          plan: async () => assert.fail('unsafe moves must not be recorded'),
          markItemMoved: async () => {},
          complete: async () => {},
          fail: async () => {},
        },
      },
      { get: async () => [], set: async () => {} },
    )

    await assert.rejects(move([volume], destination), /Volume roots/)
    await assert.rejects(move([source], nested), /into itself/)
    await assert.rejects(move([source], destination), /already exists/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
