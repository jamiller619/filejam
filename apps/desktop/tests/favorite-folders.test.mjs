import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createFavoriteFoldersHandler } from '../dist/api/favoriteFolders.js'

test('folder drops persist, deduplicate, validate and register external roots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'favorite-folders-'))

  try {
    const inside = join(directory, 'library', 'child')
    const outside = join(directory, 'external')
    const trash = join(directory, 'trash')

    await mkdir(inside, { recursive: true })
    await mkdir(outside)
    await mkdir(trash)

    const file = join(directory, 'file.txt')

    await writeFile(file, 'hello')

    let favorites = []

    const roots = [
      { rootPath: join(directory, 'library'), isTrash: false },
      { rootPath: trash, isTrash: true },
    ]

    const scans = []
    const settings = {
      get: async () => favorites,
      set: async (_key, value) => {
        favorites = value
      },
    }

    const add = createFavoriteFoldersHandler(
      {
        libraries: {
          list: async () => roots,
          ensureRoot: async (rootPath) =>
            roots.push({ rootPath, isTrash: false }),
        },
      },
      settings,
      async (root) => scans.push(root),
    )

    await assert.rejects(add([inside, file]), /Only folders/)
    assert.deepEqual(favorites, [])
    await assert.rejects(add(['relative/path']), /absolute paths/)
    await assert.rejects(add([trash]), /Trash/)
    await assert.rejects(add([join(directory, 'missing')]))
    await Promise.all([add([inside]), add([outside])])
    assert.deepEqual(favorites, [inside, outside])
    await add([inside, outside, outside])
    assert.deepEqual(favorites, [inside, outside])
    assert.deepEqual(scans, [outside])
    assert.equal(roots.length, 3)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
