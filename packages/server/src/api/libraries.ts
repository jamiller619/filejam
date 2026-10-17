import { basename } from 'node:path'
import { asc, eq } from 'drizzle-orm'
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
    async ensureRoot(root: string): Promise<Pick<Library, 'id' | 'name' | 'rootPath'>> {
      const [library] = await db
        .insert(libraries)
        .values({ name: basename(root) || root, rootPath: root })
        .onConflictDoUpdate({
          target: libraries.rootPath,
          set: { rootPath: root },
        })
        .returning({ id: libraries.id, name: libraries.name, rootPath: libraries.rootPath })
      if (!library) throw new Error('Unable to create scan library')
      return library
    },
    async ensureTrashRoots(roots: string[]): Promise<Library[]> {
      const result: Library[] = []
      const uniqueRoots = [...new Set(roots)]
      for (const rootPath of uniqueRoots) {
        const [library] = await db
          .insert(libraries)
          .values({ name: 'Trash', rootPath, isTrash: true })
          .onConflictDoUpdate({
            target: libraries.rootPath,
            set: { isTrash: true },
          })
          .returning()
        if (library) result.push(library)
      }
      const retainedRoots = new Set(uniqueRoots)
      const previousTrashRoots = await db
        .select({ id: libraries.id, rootPath: libraries.rootPath })
        .from(libraries)
        .where(eq(libraries.isTrash, true))
      for (const library of previousTrashRoots) {
        if (!retainedRoots.has(library.rootPath)) {
          await db.delete(libraries).where(eq(libraries.id, library.id))
        }
      }
      return result
    },
    async isTrashRoot(rootPath: string): Promise<boolean> {
      const [library] = await db
        .select({ isTrash: libraries.isTrash })
        .from(libraries)
        .where(eq(libraries.rootPath, rootPath))
      return library?.isTrash ?? false
    },
    async list(): Promise<Library[]> {
      return db
        .select()
        .from(libraries)
        .orderBy(asc(libraries.name), asc(libraries.id))
    },
  }
}
