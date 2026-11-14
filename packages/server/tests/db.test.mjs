import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { initDatabase } from '../dist/db/index.js'
import { entries } from '../dist/db/schemas/entry.js'
import { volumes } from '../dist/db/schemas/volume.js'

test('creates a database, preserves data on reopen, and enforces constraints', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-db-'))
  const path = join(directory, 'nested', 'files #1.sqlite')
  let connection

  try {
    connection = await initDatabase(path)

    const { db } = connection

    await db
      .insert(volumes)
      .values({ id: 1, name: 'Files', rootPath: '/files', kind: 'system' })

    const entry = {
      volumeId: 1,
      name: 'example.txt',
      parentPath: '',
      kind: 'file',
      createdAt: new Date(),
      indexedAt: new Date(),
    }

    await db.insert(entries).values(entry)
    await assert.rejects(db.insert(entries).values(entry).run())

    await assert.rejects(
      db
        .insert(entries)
        .values({ ...entry, volumeId: 999 })
        .run(),
    )
    await connection.close()

    connection = await initDatabase(path)
    assert.equal((await connection.db.select().from(volumes)).length, 1)
    const storedEntries = await connection.db.select().from(entries)

    assert.equal(storedEntries.length, 1)
    assert.equal(storedEntries[0].parentPath, '')
    assert.equal(storedEntries[0].name, 'example.txt')

    const migrations = await connection.db.all(
      'SELECT * FROM __drizzle_migrations',
    )

    const journal = JSON.parse(
      await readFile(
        new URL('../src/db/migrations/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    )

    assert.equal(migrations.length, journal.entries.length)

    const entryColumns = await connection.db.all(
      "SELECT name FROM pragma_table_info('entries')",
    )

    assert.ok(
      [
        'relative_path',
        'app_tags',
        'os_tags',
        'embedded_tags',
        'tag_read_error',
      ].every((name) => !entryColumns.some((column) => column.name === name)),
    )
    assert.ok(entryColumns.some((column) => column.name === 'parent_path'))

    await connection.db.delete(volumes)
    assert.deepEqual(
      await connection.db.select({ id: entries.id }).from(entries),
      [],
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

test('rejects an empty database path', async () => {
  await assert.rejects(initDatabase('  '), /database file path is required/)
})
