import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { initialization } from '../db/schemas/initialization.js'
import { libraries } from '../db/schemas/library.js'

const originalDefaultFolders = {
  desktop: 'Desktop',
  documents: 'Documents',
  downloads: 'Downloads',
  music: 'Music',
  pictures: 'Pictures',
  videos: 'Videos',
} as const

const applicationsDefaultFolder = {
  applications: 'Applications',
} as const

export const defaultFolders = {
  ...originalDefaultFolders,
  ...applicationsDefaultFolder,
} as const

export type DefaultFolder = keyof typeof defaultFolders

export type ResolveDefaultFolder = (folder: DefaultFolder) => string

/** Resolve native known folders only on first setup; never recreate deleted libraries. */
export async function initializeDefaultLibraries(
  db: Database,
  resolveFolder: ResolveDefaultFolder,
  warn: (message: string, error: unknown) => void,
) {
  const initializedOriginals = await initializeGroup(
    db,
    'default-libraries',
    originalDefaultFolders,
    resolveFolder,
    warn,
  )

  await initializeGroup(
    db,
    'applications-library',
    applicationsDefaultFolder,
    resolveFolder,
    warn,
  )

  return initializedOriginals
}

async function initializeGroup(
  db: Database,
  key: string,
  folders: Readonly<Partial<Record<DefaultFolder, string>>>,
  resolveFolder: ResolveDefaultFolder,
  warn: (message: string, error: unknown) => void,
) {
  const completed = await db
    .select()
    .from(initialization)
    .where(eq(initialization.key, key))

  if (completed.length) {
    return false
  }

  const defaults: (typeof libraries.$inferInsert)[] = []

  for (const folder of Object.keys(folders) as DefaultFolder[]) {
    try {
      const path = resolveFolder(folder)

      if (!isAbsolute(path)) {
        throw new Error('Expected an absolute folder path')
      }

      const rootPath = await realpath(path)

      if (!(await stat(rootPath)).isDirectory()) {
        continue
      }

      defaults.push({ name: folders[folder] ?? folder, rootPath })
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

  return true
}
