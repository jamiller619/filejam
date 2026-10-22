import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { entries, type NewEntry } from '../db/schemas/entry.js'
import { libraries } from '../db/schemas/library.js'
import { entrySize } from './entrySize.js'

export function createEntriesApi(db: Database) {
  return {
    /** Main-process file access; intentionally not exposed over renderer IPC. */
    async getFileSource(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        return null
      }

      const [source] = await db
        .select({
          rootPath: libraries.rootPath,
          relativePath: entries.relativePath,
          name: entries.name,
        })
        .from(entries)
        .innerJoin(libraries, eq(entries.libraryId, libraries.id))
        .where(and(eq(entries.id, id), eq(entries.kind, 'file')))

      return source ?? null
    },
    async listChildren(folder: {
      libraryId: number
      relativePath: string
      recursive?: boolean
      search?: string
    }) {
      if (
        !folder ||
        !Number.isSafeInteger(folder.libraryId) ||
        folder.libraryId <= 0 ||
        typeof folder.relativePath !== 'string' ||
        (folder.recursive !== undefined &&
          typeof folder.recursive !== 'boolean') ||
        (folder.search !== undefined && typeof folder.search !== 'string')
      ) {
        throw new Error('Invalid folder reference')
      }

      const search = folder.search?.trim() ?? ''
      const normalizedSearch = search.toLowerCase()
      const includeDescendants = folder.recursive || search.length > 0

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

      if (!directory) {
        return { folder: null, entries: [], scanned: false }
      }

      const children = await db
        .select({
          ...getTableColumns(entries),
          size: search || !folder.recursive ? entrySize : entries.size,
        })
        .from(entries)
        .where(
          and(
            eq(entries.libraryId, folder.libraryId),
            includeDescendants
              ? inArray(
                  entries.id,
                  sql`(
                  with recursive descendants(id, kind) as (
                    select id, kind from entries where id = ${directory.id}
                    union all
                    select child.id, child.kind from entries as child
                    join descendants on child.parent_id = descendants.id
                    where descendants.kind = 'directory'
                      and child.library_id = ${folder.libraryId}
                  )
                  select id from descendants
                )`,
                )
              : eq(entries.parentId, directory.id),
          ),
        )
        .orderBy(
          sql`case when ${entries.kind} = 'directory' then 0 else 1 end`,
          asc(entries.name),
          asc(entries.id),
        )

      return {
        folder: directory,
        entries: children.filter((entry) => {
          if (search) {
            return (
              entry.id !== directory.id &&
              (!folder.recursive || entry.kind !== 'directory') &&
              entry.name.toLowerCase().includes(normalizedSearch)
            )
          }

          return !folder.recursive || entry.kind !== 'directory'
        }),
        scanned:
          directory.childrenScannedAt !== null &&
          !directory.childrenDirty &&
          (!includeDescendants ||
            children.every(
              (entry) =>
                entry.kind !== 'directory' ||
                (entry.childrenScannedAt !== null && !entry.childrenDirty),
            )),
      }
    },
    async listPaths(libraryId: number) {
      return db
        .select({ id: entries.id, path: entries.relativePath })
        .from(entries)
        .where(eq(entries.libraryId, libraryId))
    },
    /** Preserve IDs and parent references when refreshing filesystem metadata. */
    upsert: (values: NewEntry) => upsertEntry(db, values),
    /** Reconcile deletions only after a complete, successful traversal. */
    async completeScan(libraryId: number, unseenIds: Iterable<number>) {
      await db.transaction(async (tx) => {
        const ids = [...unseenIds]

        // Stay below SQLite's parameter limit, including the library filter.
        for (let index = 0; index < ids.length; index += 500) {
          await tx
            .delete(entries)
            .where(
              and(
                eq(entries.libraryId, libraryId),
                inArray(entries.id, ids.slice(index, index + 500)),
              ),
            )
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

/** Shared by individual API writes and scanner-owned batch transactions. */
export async function upsertEntry(
  db: Pick<Database, 'insert'>,
  values: NewEntry,
) {
  const [entry] = await db
    .insert(entries)
    .values(values)
    .onConflictDoUpdate({
      target: [entries.libraryId, entries.relativePath],
      set: values,
    })
    .returning({ id: entries.id })

  if (!entry) {
    throw new Error(`Unable to save ${values.relativePath}`)
  }

  return entry
}
