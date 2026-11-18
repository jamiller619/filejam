import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { initConfig } from '../../../packages/server/dist/config/index.js'
import { initDatabase } from '../../../packages/server/dist/db/index.js'
import { libraries } from '../../../packages/server/dist/db/schemas/library.js'

const config = await initConfig()
const path = join(config.get('appdata.dbPath'), 'filejam.sqlite')
try {
  await access(path)
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error
  }
  console.log('No existing library database to clean.')
  process.exit(0)
}
const database = await initDatabase(path, false)
try {
  const removed = await database.db
    .delete(libraries)
    .returning({ id: libraries.id })
  console.log(
    `Removed ${removed.length} library records from ${path}. Cascaded indexed entries were removed; filesystem contents were not touched.`,
  )
} finally {
  database.close()
}
