import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createApi } from '../dist/api/index.js'

test('collections span libraries, preserve membership on rescan, and cascade deleted files', async () => {
  const client = createClient({ url: ':memory:' })

  try {
    await client.execute('PRAGMA foreign_keys = ON')

    const db = drizzle(client)

    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../dist/db/migrations/', import.meta.url),
      ),
    })

    const api = createApi(db)

    assert.deepEqual(
      (await api.collections.list()).map((item) => item.id),
      ['favorites', 'recents'],
    )

    const first = await api.libraries.ensureRoot('/first')
    const second = await api.libraries.ensureRoot('/second')

    const values = {
      libraryId: first.id,
      relativePath: 'one.txt',
      name: 'one.txt',
      kind: 'file',
      indexedAt: new Date(),
      appTags: ['test'],
    }

    const one = await api.entries.upsert(values)
    const two = await api.entries.upsert({ ...values, libraryId: second.id })
    const collection = await api.collections.create('  Project  ')

    assert.equal(collection.name, 'Project')
    await api.collections.setMembership(collection.id, one.id, true)
    await api.collections.setMembership(collection.id, two.id, true)
    await api.collections.setMembership(collection.id, one.id, true)

    let listing = await api.collections.listEntries(collection.id)

    assert.equal(listing.entries.length, 2)

    assert.deepEqual(
      new Set(listing.entries.map((entry) => entry.libraryId)),
      new Set([first.id, second.id]),
    )

    assert.deepEqual(listing.entries[0].tags, ['test'])
    await api.entries.upsert({ ...values, size: 100 })
    listing = await api.collections.listEntries(collection.id)
    assert.equal(listing.entries.find((entry) => entry.id === one.id).size, 100)
    await api.collections.setMembership('favorites', one.id, true)

    assert.ok(
      (await api.collections.forEntry(one.id)).some(
        (item) => item.id === 'favorites',
      ),
    )

    await api.collections.setMembership('favorites', one.id, false)

    assert.equal(
      (await api.collections.listEntries('favorites')).entries.length,
      0,
    )

    await api.collections.recordView(one.id)
    await api.collections.recordView(two.id)

    await client.execute({
      sql: "UPDATE collection_entries SET added_at = 1 WHERE collection_id = 'recents' AND entry_id = ?",
      args: [one.id],
    })

    await api.collections.recordView(one.id)

    assert.equal(
      (await api.collections.listEntries('recents')).entries[0].id,
      one.id,
    )

    assert.equal(
      (await api.collections.listEntries('recents')).entries.length,
      2,
    )

    await assert.rejects(
      () => api.collections.setMembership('recents', one.id, false),
      /automatically/,
    )

    await assert.rejects(() => api.collections.create(' '), /Invalid/)

    await assert.rejects(
      () => api.collections.listEntries('missing'),
      /not found/,
    )

    await assert.rejects(
      () => api.collections.setMembership(collection.id, -1, true),
      /Invalid/,
    )

    const folder = await api.entries.upsert({
      ...values,
      relativePath: '',
      kind: 'directory',
    })

    await assert.rejects(
      () => api.collections.setMembership(collection.id, folder.id, true),
      /not found/,
    )

    await api.entries.completeScan(first.id, [one.id])

    assert.equal(
      (await api.collections.listEntries(collection.id)).entries.length,
      1,
    )

    assert.equal(
      (await api.collections.listEntries('recents')).entries.length,
      1,
    )
  } finally {
    client.close()
  }
})
