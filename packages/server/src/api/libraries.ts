import { basename } from 'node:path'
import { asc } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { type Library, libraries } from '../db/schemas/library.js'
import {
  initializeDefaultLibraries,
  type ResolveDefaultFolder,
} from './defaultLibraries.js'

export function createLibrariesApi(db: Database) {
  return {
    initializeDefaults(
      resolveFolder: ResolveDefaultFolder,
      warn: (message: string, error: unknown) => void,
    ) {
      return initializeDefaultLibraries(db, resolveFolder, warn)
    },
    /** Reuse a canonical scan root without overwriting the library's name. */
    async ensureRoot(root: string): Promise<Library> {
      const [library] = await db
        .insert(libraries)
        .values({ name: basename(root) || root, rootPath: root })
        .onConflictDoUpdate({
          target: libraries.rootPath,
          set: { rootPath: root },
        })
        .returning()
      if (!library) throw new Error('Unable to create scan library')
      return library
    },
    async list(): Promise<Library[]> {
      return db
        .select()
        .from(libraries)
        .orderBy(asc(libraries.name), asc(libraries.id))
    },
  }
}
