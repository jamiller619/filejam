import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import * as entrySchema from './schemas/entry.js'
import * as librarySchema from './schemas/library.js'

const schema = { ...librarySchema, ...entrySchema }
// Resolve beside the compiled module; the build copies SQL migrations there.
const migrationsFolder = fileURLToPath(
  new URL('./migrations/', import.meta.url),
)

/** Opens a local SQLite database and applies pending migrations before use. */
export async function initDatabase(path: string) {
  if (!path.trim()) {
    throw new Error('A database file path is required')
  }

  const databasePath = resolve(path)
  await mkdir(dirname(databasePath), { recursive: true })

  const client = createClient({ url: pathToFileURL(databasePath).href })

  try {
    // Main-thread readers and the scanner use separate connections. WAL lets
    // readers continue during writes; the timeout tolerates brief lock contention.
    // Foreign-key enforcement is enabled on every connection for cascade deletes.
    await client.execute('PRAGMA busy_timeout = 5000')
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA foreign_keys = ON')
    const db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })

    return { db, close: () => client.close() }
  } catch (error) {
    client.close()
    throw error
  }
}

export type Database = Awaited<ReturnType<typeof initDatabase>>['db']
