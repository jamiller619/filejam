import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { entries, type NewEntry } from '../db/schemas/entry.js'
import { libraries } from '../db/schemas/library.js'
import { mergeTags, normalizeTags } from '../metadata/tags.js'
import { entrySize } from './entrySize.js'

export function createEntriesApi(db: Database) {
  return {
    /** Main-process file access; intentionally not exposed over renderer IPC. */
    async getFileSource(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) return null
      const [source] = await db
        .select({
          rootPath: libraries.rootPath,
          relativePath: entries.relativePath,
        })
        .from(entries)
        .innerJoin(libraries, eq(entries.libraryId, libraries.id))
        .where(and(eq(entries.id, id), eq(entries.kind, 'file')))
      return source ?? null
    },
    async listChildren(folder: { libraryId: number; relativePath: string }) {
      if (
        !folder ||
        !Number.isSafeInteger(folder.libraryId) ||
        folder.libraryId <= 0 ||
        typeof folder.relativePath !== 'string'
      ) {
        throw new Error('Invalid folder reference')
      }
      const [directory] = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.libraryId, folder.libraryId),
            eq(entries.relativePath, folder.relativePath),
            eq(entries.kind, 'directory'),
          ),
        )
      if (!directory) return { entries: [], scanned: false }
      const children = await db
        .select({ ...getTableColumns(entries), size: entrySize })
        .from(entries)
        .where(
          and(
            eq(entries.libraryId, folder.libraryId),
            eq(entries.parentId, directory.id),
          ),
        )
        .orderBy(asc(entries.name), asc(entries.id))
      return {
        entries: children.map((entry) => ({
          ...entry,
          tags: mergeTags(entry),
        })),
        scanned:
          directory.childrenScannedAt !== null && !directory.childrenDirty,
      }
    },
    async setAppTags(id: number, tags: string[]) {
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !Array.isArray(tags) ||
        tags.length > 100 ||
        tags.some((tag) => typeof tag !== 'string' || tag.length > 256)
      ) {
        throw new Error('Invalid file tags')
      }
      const [entry] = await db
        .update(entries)
        .set({ appTags: normalizeTags(tags) })
        .where(eq(entries.id, id))
        .returning()
      if (!entry) throw new Error('File not found')
      const [sized] = await db
        .select({ size: entrySize })
        .from(entries)
        .where(eq(entries.id, id))
      return {
        ...entry,
        size: sized?.size ?? entry.size,
        tags: mergeTags(entry),
      }
    },
    async listPaths(libraryId: number) {
      return db
        .select({ id: entries.id, path: entries.relativePath })
        .from(entries)
        .where(eq(entries.libraryId, libraryId))
    },
    /** Preserve IDs and parent references when refreshing filesystem metadata. */
    async upsert(values: NewEntry) {
      const [entry] = await db
        .insert(entries)
        .values(values)
        .onConflictDoUpdate({
          target: [entries.libraryId, entries.relativePath],
          set: values,
        })
        .returning({ id: entries.id })
      if (!entry) throw new Error(`Unable to save ${values.relativePath}`)
      return entry
    },
    /** Reconcile deletions only after a complete, successful traversal. */
    async completeScan(libraryId: number, unseenIds: Iterable<number>) {
      await db.transaction(async (tx) => {
        for (const id of unseenIds) {
          await tx
            .delete(entries)
            .where(and(eq(entries.libraryId, libraryId), eq(entries.id, id)))
        }
        await tx
          .update(entries)
          .set({ childrenDirty: false, childrenScannedAt: new Date() })
          .where(
            and(
              eq(entries.libraryId, libraryId),
              eq(entries.kind, 'directory'),
            ),
          )
      })
    },
  }
}
