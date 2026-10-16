import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { initialization } from '../db/schemas/initialization.js'
import { libraries } from '../db/schemas/library.js'

export const defaultFolders = {
  desktop: 'Desktop',
  documents: 'Documents',
  downloads: 'Downloads',
  music: 'Music',
  pictures: 'Pictures',
  videos: 'Videos',
} as const

export type DefaultFolder = keyof typeof defaultFolders
export type ResolveDefaultFolder = (folder: DefaultFolder) => string

/** Resolve native known folders only on first setup; never recreate deleted libraries. */
export async function initializeDefaultLibraries(
  db: Database,
  resolveFolder: ResolveDefaultFolder,
  warn: (message: string, error: unknown) => void,
) {
  const key = 'default-libraries'
  const completed = await db
    .select()
    .from(initialization)
    .where(eq(initialization.key, key))
  if (completed.length) return

  const defaults: (typeof libraries.$inferInsert)[] = []
  for (const folder of Object.keys(defaultFolders) as DefaultFolder[]) {
    try {
      const path = resolveFolder(folder)
      if (!isAbsolute(path)) throw new Error('Expected an absolute folder path')
      const rootPath = await realpath(path)
      if (!(await stat(rootPath)).isDirectory()) continue
      defaults.push({ name: defaultFolders[folder], rootPath })
    } catch (error) {
      // OS folders can be absent, disabled, or inaccessible. Do not create them.
      warn(`Skipping default folder: ${folder}`, error)
    }
  }

  await db.transaction(async (tx) => {
    if (defaults.length) {
      await tx.insert(libraries).values(defaults).onConflictDoNothing()
    }
    // Commit the marker with the libraries, including when none are available.
    await tx.insert(initialization).values({ key }).onConflictDoNothing()
  })
}
