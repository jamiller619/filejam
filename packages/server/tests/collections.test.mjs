import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createApi } from '../dist/api/index.js'

const definition = (overrides = {}) => ({
  version: 1,
  match: 'all',
  rules: [],
  sort: [{ field: 'name', direction: 'asc' }],
  limit: null,
  ...overrides,
})

test('collections evaluate saved rules from entry metadata and user state', async () => {
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
    const now = new Date()
    const base = {
      relativePath: 'one.txt',
      name: 'one.txt',
      kind: 'file',
      size: 100,
      createdAt: now,
      modifiedAt: now,
      indexedAt: now,
    }

    const one = await api.entries.upsert({ ...base, libraryId: first.id })
    const two = await api.entries.upsert({
      ...base,
      libraryId: second.id,
      relativePath: 'two.jpg',
      name: 'two.jpg',
      size: 200,
    })

    const project = await api.collections.create({
      name: ' Project ',
      definition: definition({
        match: 'any',
        rules: [
          { field: 'name', operator: 'contains', value: 'ONE' },
          { field: 'size', operator: 'greaterThan', value: 150 },
        ],
        sort: [{ field: 'size', direction: 'desc' }],
      }),
    })

    assert.equal(project.name, 'Project')
    assert.deepEqual(
      (await api.collections.listEntries(project.id)).entries.map(
        (entry) => entry.id,
      ),
      [two.id, one.id],
    )

    await api.collections.update(project.id, {
      name: 'Images',
      definition: definition({
        rules: [
          { field: 'relativePath', operator: 'startsWith', value: 'two' },
          { field: 'kind', operator: 'equals', value: 'file' },
        ],
      }),
    })

    assert.deepEqual(
      (await api.collections.listEntries(project.id)).entries.map(
        (entry) => entry.id,
      ),
      [two.id],
    )

    await api.collections.setFavorite(one.id, true)
    assert.ok((await api.collections.getEntryState(one.id)).favoritedAt)
    assert.deepEqual(
      (await api.collections.listEntries('favorites')).entries.map(
        (entry) => entry.id,
      ),
      [one.id],
    )
    assert.ok(
      (await api.collections.forEntry(one.id)).some(
        (item) => item.id === 'favorites',
      ),
    )

    await api.collections.setFavorite(one.id, false)
    assert.equal(
      (await api.collections.listEntries('favorites')).entries.length,
      0,
    )

    await api.collections.recordView(one.id)
    await api.collections.recordView(two.id)
    await client.execute({
      sql: 'UPDATE entry_states SET last_opened_at = 1 WHERE entry_id = ?',
      args: [one.id],
    })
    await api.collections.recordView(one.id)

    assert.deepEqual(
      (await api.collections.listEntries('recents')).entries.map(
        (entry) => entry.id,
      ),
      [one.id, two.id],
    )

    await api.collections.delete('recents')

    const recreated = await api.collections.create({
      name: 'Opened lately',
      definition: definition({
        rules: [{ field: 'lastOpenedAt', operator: 'isSet' }],
        sort: [{ field: 'lastOpenedAt', direction: 'desc' }],
        limit: 1,
      }),
    })

    assert.notEqual(recreated.id, 'recents')
    assert.deepEqual(
      (await api.collections.listEntries(recreated.id)).entries.map(
        (entry) => entry.id,
      ),
      [one.id],
    )

    await assert.rejects(
      () =>
        api.collections.create({
          name: 'Broken',
          definition: definition({
            rules: [{ field: 'name', operator: 'greaterThan', value: 'x' }],
          }),
        }),
      /Invalid collection rule/,
    )

    await api.entries.completeScan(first.id, [one.id])
    await api.entries.completeScan(second.id, [two.id])

    assert.equal(
      (await api.collections.listEntries(recreated.id)).entries.length,
      0,
    )

    await api.collections.delete(project.id)
    await assert.rejects(
      () => api.collections.listEntries(project.id),
      /not found/,
    )
  } finally {
    client.close()
  }
})
