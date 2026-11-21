import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createApi } from '../dist/api/index.js'

const icon = { kind: 'library', name: 'lucide:rocket', color: 'blue' }

async function fixture(run) {
  const client = createClient({ url: ':memory:' })

  try {
    await client.execute('PRAGMA foreign_keys = ON')

    const db = drizzle(client)

    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../dist/db/migrations/', import.meta.url),
      ),
    })
    await run(createApi(db), client)
  } finally {
    client.close()
  }
}

test('icons survive rescans, are shared by entry targets, and reset independently', async () => {
  await fixture(async (api) => {
    const library = await api.libraries.ensureRoot('/icons')
    const values = {
      libraryId: library.id,
      relativePath: '',
      name: 'icons',
      kind: 'directory',
      createdAt: new Date(),
      indexedAt: new Date(),
    }
    const folder = await api.entries.upsert(values)
    const target = { kind: 'entry', libraryId: library.id, relativePath: '' }

    await api.appearance.set(target, icon)
    await api.appearance.set({ kind: 'collection', id: 'favorites' }, icon)
    await api.entries.upsert({ ...values, indexedAt: new Date() })
    await api.entries.completeScan(library.id, [])

    assert.deepEqual(
      (await api.appearance.list()).find((row) => row.target.kind === 'entry'),
      { target, icon },
    )
    assert.equal((await api.entries.listPaths(library.id))[0].id, folder.id)

    await api.appearance.set(target, null)

    assert.equal((await api.appearance.list()).length, 1)
    await assert.rejects(
      api.appearance.set(target, { ...icon, name: 'lucide:unknown' }),
      /Invalid icon/,
    )
    await assert.rejects(
      api.appearance.set(target, { ...icon, color: 'url(evil)' }),
      /Invalid icon/,
    )
    await assert.rejects(
      api.appearance.set(target, { kind: 'upload', assetId: 'a'.repeat(64) }),
      /not found/,
    )
    await assert.rejects(
      api.appearance.set({ kind: 'collection', id: 'missing' }, icon),
      /not found/,
    )
  })
})

test('asset collection retains shared and pending-move uploads and removes abandoned imports', async () => {
  await fixture(async (api, client) => {
    const shared = 'a'.repeat(64)
    const unused = 'b'.repeat(64)

    await api.appearance.registerAsset(shared)
    await api.appearance.registerAsset(unused)
    await api.appearance.set(
      { kind: 'collection', id: 'favorites' },
      { kind: 'upload', assetId: shared },
    )
    await api.appearance.set(
      { kind: 'collection', id: 'recents' },
      { kind: 'upload', assetId: shared },
    )
    await api.appearance.set({ kind: 'collection', id: 'favorites' }, null)
    const pending = 'c'.repeat(64)
    const library = await api.libraries.ensureRoot('/pending')

    await api.appearance.registerAsset(pending)
    await client.execute({
      sql: 'INSERT INTO pending_appearance(library_id, relative_path, icon) VALUES (?, ?, ?)',
      args: [
        library.id,
        'moved.png',
        JSON.stringify({ kind: 'upload', assetId: pending }),
      ],
    })
    await client.execute('UPDATE icon_assets SET created_at = 0')

    assert.deepEqual(await api.appearance.collectUnusedAssets(), [unused])
    assert.equal((await api.appearance.list())[0].icon.assetId, shared)
  })
})
