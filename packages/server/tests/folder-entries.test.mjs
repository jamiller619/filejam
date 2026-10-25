import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApi } from '../dist/api/index.js'
import { initDatabase } from '../dist/db/index.js'

test('folder contents are immediate children isolated by library and report scan state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-folder-'))
  let connection

  try {
    connection = await initDatabase(join(directory, 'filejam.sqlite'))

    const api = createApi(connection.db)
    const library = await api.libraries.ensureRoot('/first')
    const other = await api.libraries.ensureRoot('/second')
    const folder = { libraryId: library.id, relativePath: '' }

    assert.deepEqual(await api.entries.listChildren(folder), {
      folder: null,
      entries: [],
      scanned: false,
    })

    const save = (libraryId, relativePath, parentId, kind = 'file') =>
      api.entries.upsert({
        libraryId,
        relativePath,
        parentId,
        kind,
        name: relativePath.split('/').at(-1) || 'root',
        indexedAt: new Date(),
      })

    const root = await save(library.id, '', null, 'directory')
    const nested = await save(library.id, 'nested', root.id, 'directory')

    await save(library.id, 'alpha', root.id, 'directory')
    await save(library.id, 'z.txt', root.id)
    await save(library.id, 'a.txt', root.id)
    await save(library.id, 'nested/hidden.txt', nested.id)

    const otherRoot = await save(other.id, '', null, 'directory')

    await save(other.id, 'other.txt', otherRoot.id)

    const listing = await api.entries.listChildren(folder)

    assert.equal(listing.folder.id, root.id)

    assert.deepEqual(
      listing.entries.map((entry) => entry.name),
      ['alpha', 'nested', 'a.txt', 'z.txt'],
    )

    assert.equal(listing.scanned, false)

    const deep = await save(library.id, 'nested/deep', nested.id, 'directory')

    await save(library.id, 'nested/deep/a.txt', deep.id)

    const flattened = await api.entries.listChildren({
      ...folder,
      recursive: true,
    })

    assert.deepEqual(
      flattened.entries.map((entry) => entry.relativePath),
      ['a.txt', 'nested/deep/a.txt', 'nested/hidden.txt', 'z.txt'],
    )

    assert.equal(flattened.scanned, false)
    await api.entries.completeScan(library.id, [])
    assert.equal((await api.entries.listChildren(folder)).scanned, true)

    assert.equal(
      (await api.entries.listChildren({ ...folder, recursive: true })).scanned,
      true,
    )

    assert.deepEqual(
      (
        await api.entries.listChildren({
          ...folder,
          relativePath: 'nested',
          recursive: true,
        })
      ).entries.map((entry) => entry.relativePath),
      ['nested/deep/a.txt', 'nested/hidden.txt'],
    )

    await save(library.id, 'nested/deep/pending', deep.id, 'directory')
    assert.equal((await api.entries.listChildren(folder)).scanned, true)

    assert.equal(
      (await api.entries.listChildren({ ...folder, recursive: true })).scanned,
      false,
    )

    assert.deepEqual(
      (
        await api.entries.listChildren({ ...folder, relativePath: 'nested' })
      ).entries.map((entry) => entry.name),
      ['deep', 'hidden.txt'],
    )

    assert.deepEqual(
      (
        await api.entries.listChildren({
          ...folder,
          search: 'A.TXT',
        })
      ).entries.map((entry) => entry.relativePath),
      ['a.txt', 'nested/deep/a.txt'],
    )

    assert.deepEqual(
      (
        await api.entries.listChildren({
          ...folder,
          search: 'deep',
        })
      ).entries.map((entry) => entry.relativePath),
      ['nested/deep'],
    )

    assert.deepEqual(
      (
        await api.entries.listChildren({
          ...folder,
          relativePath: 'nested',
          search: 'z.txt',
        })
      ).entries,
      [],
    )

    await assert.rejects(
      () => api.entries.listChildren({ libraryId: '1', relativePath: '' }),
      /Invalid folder/,
    )

    await assert.rejects(() => api.entries.listChildren(null), /Invalid folder/)

    await assert.rejects(
      () => api.entries.listChildren({ ...folder, recursive: 'yes' }),
      /Invalid folder/,
    )

    await assert.rejects(
      () => api.entries.listChildren({ ...folder, search: 123 }),
      /Invalid folder/,
    )
  } finally {
    connection?.close()

    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})

test('folder sizes include nested contents and reflect updates and deletions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-sizes-'))
  let connection

  try {
    connection = await initDatabase(join(directory, 'filejam.sqlite'))

    const api = createApi(connection.db)
    const library = await api.libraries.ensureRoot('/sizes')

    const save = (relativePath, parentId, kind, size = null) =>
      api.entries.upsert({
        libraryId: library.id,
        relativePath,
        parentId,
        kind,
        size,
        name: relativePath.split('/').at(-1) || 'root',
        indexedAt: new Date(),
      })

    const root = await save('', null, 'directory')
    const folder = await save('folder', root.id, 'directory', 999)
    const nested = await save('folder/nested', folder.id, 'directory', 999)

    await save('empty', root.id, 'directory')
    await save('outside', root.id, 'file', 1000)
    await save('folder/a', folder.id, 'file', 12)

    const deep = await save('folder/nested/b', nested.id, 'file', 30)

    await save('folder/link', folder.id, 'symlink', 5)

    const sizes = async () =>
      Object.fromEntries(
        (
          await api.entries.listChildren({
            libraryId: library.id,
            relativePath: '',
          })
        ).entries.map((entry) => [entry.name, entry.size]),
      )

    assert.deepEqual(await sizes(), { empty: 0, folder: 47, outside: 1000 })
    await save('folder/a', folder.id, 'file', 20)
    assert.equal((await sizes()).folder, 55)
    await api.entries.completeScan(library.id, [deep.id])
    assert.equal((await sizes()).folder, 25)
  } finally {
    connection?.close()

    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})
