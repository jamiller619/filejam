import { lstat, readdir } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import mime from 'mime'
import type { Database } from '../db/index.js'
import { entries, type NewEntry } from '../db/schemas/entry.js'
import { volumes } from '../db/schemas/volume.js'
import { entrySize } from './entrySize.js'

export function createEntriesApi(db: Database) {
  return {
    /** Main-process entry access; intentionally not exposed over renderer IPC. */
    async getEntrySource(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        return null
      }

      const [source] = await db
        .select({
          rootPath: volumes.rootPath,
          relativePath: entries.relativePath,
          name: entries.name,
          kind: entries.kind,
        })
        .from(entries)
        .innerJoin(volumes, eq(entries.volumeId, volumes.id))
        .where(eq(entries.id, id))

      return source ?? null
    },
    async listChildren(folder: {
      volumeId: number
      relativePath: string
      recursive?: boolean
      search?: string
    }) {
      if (
        !folder ||
        !Number.isSafeInteger(folder.volumeId) ||
        folder.volumeId <= 0 ||
        typeof folder.relativePath !== 'string' ||
        (folder.recursive !== undefined &&
          typeof folder.recursive !== 'boolean') ||
        (folder.search !== undefined && typeof folder.search !== 'string')
      ) {
        throw new Error('Invalid folder reference')
      }

      let refreshError: unknown

      try {
        await refreshDirectory(db, folder.volumeId, folder.relativePath)
      } catch (error) {
        refreshError = error
      }

      const search = folder.search?.trim() ?? ''
      const normalizedSearch = search.toLowerCase()
      const includeDescendants = folder.recursive || search.length > 0

      const [directory] = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.volumeId, folder.volumeId),
            eq(entries.relativePath, folder.relativePath),
            eq(entries.kind, 'directory'),
          ),
        )

      if (!directory) {
        if (refreshError) {
          throw refreshError
        }

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
            eq(entries.volumeId, folder.volumeId),
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
                      and child.volume_id = ${folder.volumeId}
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
    async listPaths(volumeId: number) {
      return db
        .select({ id: entries.id, path: entries.relativePath })
        .from(entries)
        .where(eq(entries.volumeId, volumeId))
    },
    /** Preserve IDs and parent references when refreshing filesystem metadata. */
    upsert: (values: NewEntry) => upsertEntry(db, values),
    /** Reconcile deletions only after a complete, successful traversal. */
    async completeScan(volumeId: number, unseenIds: Iterable<number>) {
      await db.transaction(async (tx) => {
        const ids = [...unseenIds]

        // Stay below SQLite's parameter limit, including the volume filter.
        for (let index = 0; index < ids.length; index += 500) {
          await tx
            .delete(entries)
            .where(
              and(
                eq(entries.volumeId, volumeId),
                inArray(entries.id, ids.slice(index, index + 500)),
              ),
            )
        }

        await tx
          .update(entries)
          .set({ childrenDirty: false, childrenScannedAt: new Date() })
          .where(
            and(eq(entries.volumeId, volumeId), eq(entries.kind, 'directory')),
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
      target: [entries.volumeId, entries.relativePath],
      set: values,
    })
    .returning({ id: entries.id })

  if (!entry) {
    throw new Error(`Unable to save ${values.relativePath}`)
  }

  return entry
}

async function refreshDirectory(
  db: Database,
  volumeId: number,
  relativePath: string,
) {
  const [volume] = await db
    .select()
    .from(volumes)
    .where(eq(volumes.id, volumeId))

  if (!volume) {
    throw new Error('Volume not found')
  }

  const directoryPath = resolve(volume.rootPath, relativePath)
  const relation = relative(volume.rootPath, directoryPath)

  if (
    isAbsolute(relativePath) ||
    relation === '..' ||
    relation.startsWith(`..${sep}`)
  ) {
    throw new Error('Folder path is outside its volume')
  }

  const directory = await ensureDirectory(
    db,
    volume.id,
    volume.rootPath,
    relation,
  )
  const children = await readdir(directoryPath, { withFileTypes: true })
  const indexedAt = new Date()
  const visibleNames = new Set<string>()

  for (const child of children) {
    const childPath = resolve(directoryPath, child.name)

    try {
      const metadata = await lstat(childPath)
      const childRelativePath = relative(volume.rootPath, childPath)
        .split(sep)
        .join('/')
      const kind = metadata.isDirectory()
        ? 'directory'
        : metadata.isSymbolicLink()
          ? 'symlink'
          : 'file'

      visibleNames.add(child.name)

      await upsertEntry(db, {
        volumeId: volume.id,
        parentId: directory.id,
        name: child.name,
        relativePath: childRelativePath,
        kind,
        size: kind === 'directory' ? null : metadata.size,
        mimeType:
          kind === 'file'
            ? (mime.getType(child.name) ?? 'application/octet-stream')
            : null,
        modifiedAt: metadata.mtime,
        createdAt: metadata.birthtime,
        indexedAt,
        childrenDirty: kind === 'directory',
      })
    } catch {
      // Files may disappear or become inaccessible while a directory is read.
    }
  }

  const previousChildren = await db
    .select({ id: entries.id, name: entries.name })
    .from(entries)
    .where(eq(entries.parentId, directory.id))

  for (const child of previousChildren) {
    if (!visibleNames.has(child.name)) {
      await db.delete(entries).where(eq(entries.id, child.id))
    }
  }

  await db
    .update(entries)
    .set({ childrenDirty: false, childrenScannedAt: indexedAt })
    .where(eq(entries.id, directory.id))
}

async function ensureDirectory(
  db: Database,
  volumeId: number,
  rootPath: string,
  nativeRelativePath: string,
) {
  const segments = nativeRelativePath.split(sep).filter(Boolean)
  let parentId: number | null = null
  let currentPath = rootPath
  let directory: { id: number } | undefined

  for (let index = 0; index <= segments.length; index++) {
    const segment = segments[index - 1]

    if (segment) {
      currentPath = resolve(currentPath, segment)
    }

    const metadata = await lstat(currentPath)

    if (!metadata.isDirectory()) {
      throw new Error('Folder location is not a directory')
    }

    const path = relative(rootPath, currentPath).split(sep).join('/')
    directory = await upsertEntry(db, {
      volumeId,
      parentId,
      name: segment ?? (basename(rootPath) || rootPath),
      relativePath: path,
      kind: 'directory',
      size: null,
      mimeType: null,
      modifiedAt: metadata.mtime,
      createdAt: metadata.birthtime,
      indexedAt: new Date(),
      childrenDirty: true,
    })
    parentId = directory.id
  }

  if (!directory) {
    throw new Error('Unable to index folder')
  }

  return directory
}
