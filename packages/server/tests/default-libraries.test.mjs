import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createApi } from '../dist/api/index.js'
import { initialization } from '../dist/db/schemas/initialization.js'
import { libraries } from '../dist/db/schemas/library.js'

test('seeds native paths once and preserves existing names and later deletions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-defaults-'))
  let connection

  try {
    const folders = {
      desktop: join(directory, 'Desktop'),
      documents: join(directory, 'OneDrive', 'Mes documents'),
      downloads: join(directory, 'Downloads'),
      music: join(directory, 'Music'),
      pictures: join(directory, 'Pictures'),
      videos: join(directory, 'Movies'),
    }

    for (const folder of Object.values(folders)) {
      await mkdir(folder, { recursive: true })
    }

    connection = await createTestDatabase()

    await connection.db.insert(libraries).values({
      name: 'My work',
      rootPath: await realpath(folders.documents),
    })

    const warnings = []
    const requested = []

    await createApi(connection.db).libraries.initializeDefaults(
      (key) => {
        requested.push(key)

        return folders[key]
      },
      (...args) => warnings.push(args),
    )

    assert.deepEqual(requested, Object.keys(folders))
    assert.deepEqual(warnings, [])

    const saved = await connection.db.select().from(libraries)

    assert.equal(saved.length, 6)

    assert.equal(
      saved.find((item) => item.name === 'My work').rootPath,
      await realpath(folders.documents),
    )

    assert.equal(
      saved.find((item) => item.name === 'Videos').rootPath,
      await realpath(folders.videos),
    )

    await connection.db.delete(libraries)

    await createApi(connection.db).libraries.initializeDefaults(
      () => {
        assert.fail('Should not resolve folders again')
      },
      () => assert.fail('Should not warn'),
    )

    assert.deepEqual(await connection.db.select().from(libraries), [])
  } finally {
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('skips unavailable folders and files, and deduplicates resolved paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-defaults-'))
  let connection

  try {
    connection = await createTestDatabase()

    const file = join(directory, 'file.txt')

    await writeFile(file, '')

    const warnings = []

    await createApi(connection.db).libraries.initializeDefaults(
      (key) => {
        if (key === 'desktop') {
          throw new Error('Unavailable OS folder')
        }

        if (key === 'documents') {
          return join(directory, 'missing')
        }

        if (key === 'downloads') {
          return file
        }

        if (key === 'music') {
          return 'relative/path'
        }

        return directory
      },
      (...args) => warnings.push(args),
    )

    const saved = await connection.db.select().from(libraries)

    assert.equal(saved.length, 1)
    assert.equal(saved[0].rootPath, await realpath(directory))
    assert.equal(warnings.length, 3)
    assert.equal((await connection.db.select().from(initialization)).length, 1)
  } finally {
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('an empty setup completes once, and a failed transaction can be retried', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-defaults-'))
  let connection

  try {
    connection = await createTestDatabase()

    await connection.db.run(`CREATE TRIGGER fail_setup BEFORE INSERT ON initialization
      BEGIN SELECT RAISE(ABORT, 'test failure'); END`)

    await assert.rejects(
      createApi(connection.db).libraries.initializeDefaults(
        () => directory,
        () => {},
      ),
    )

    assert.deepEqual(await connection.db.select().from(libraries), [])
    assert.deepEqual(await connection.db.select().from(initialization), [])
    await connection.db.run('DROP TRIGGER fail_setup')

    await createApi(connection.db).libraries.initializeDefaults(
      () => join(directory, 'missing'),
      () => {},
    )

    await createApi(connection.db).libraries.initializeDefaults(
      () => directory,
      () => {},
    )

    assert.deepEqual(await connection.db.select().from(libraries), [])
    assert.equal((await connection.db.select().from(initialization)).length, 1)
  } finally {
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

// Exercise the real migrations and transactions without Windows SQLite file locks.
async function createTestDatabase() {
  const client = createClient({ url: ':memory:' })
  const db = drizzle(client)

  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL('../dist/db/migrations/', import.meta.url),
      ),
    })

    return { db, close: () => client.close() }
  } catch (error) {
    client.close()

    throw error
  }
}
