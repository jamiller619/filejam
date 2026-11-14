import { lstat, readdir } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm'
import mime from 'mime'
import type { Database } from '../db/index.js'
import { entries, type NewEntry } from '../db/schemas/entry.js'
import { volumes } from '../db/schemas/volume.js'
import { entrySize } from './entrySize.js'

const {
  parentPath: _parentPath,
  displayName: _displayName,
  name: _name,
  ...storedEntryColumns
} = getTableColumns(entries)
const entryName = sql<string>`coalesce(${entries.displayName}, ${entries.name})`
const entryRelativePath = sql<string>`case
  when ${entries.parentId} is null and ${entries.kind} = 'directory' then ''
  when ${entries.parentPath} = '' then ${entries.name}
  else ${entries.parentPath} || '/' || ${entries.name}
end`
const entryColumns = {
  ...storedEntryColumns,
  name: entryName,
  relativePath: entryRelativePath,
}

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
          relativePath: entryRelativePath,
          name: entryName,
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
        .select({
          ...getTableColumns(entries),
          size: entrySize,
        })
        .from(entries)
        .where(
          and(
            eq(entries.volumeId, folder.volumeId),
            entryPathCondition(folder.volumeId, folder.relativePath),
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
          ...entryColumns,
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
          asc(entryName),
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
    async listPaths(volumeId: number, relativePrefix = '') {
      return db
        .select({ id: entries.id, path: entryRelativePath })
        .from(entries)
        .where(volumePathCondition(volumeId, relativePrefix))
    },
    async listScanEntries(volumeId: number, relativePrefix = '') {
      return db
        .select({
          id: entries.id,
          path: entryRelativePath,
          kind: entries.kind,
          size: entries.size,
          modifiedAt: entries.modifiedAt,
        })
        .from(entries)
        .where(volumePathCondition(volumeId, relativePrefix))
    },
    async listDirectoryAncestors(volumeId: number, relativePath: string) {
      const ancestors = ancestorPaths(relativePath)

      if (!ancestors.length) {
        return []
      }

      return db
        .select({ id: entries.id, path: entryRelativePath })
        .from(entries)
        .where(
          and(
            eq(entries.volumeId, volumeId),
            eq(entries.kind, 'directory'),
            inArray(entryRelativePath, ancestors),
          ),
        )
    },
    /** Preserve IDs and parent references when refreshing filesystem metadata. */
    upsert: (values: NewEntry) => upsertEntry(db, values),
    /** Reconcile deletions only after a complete, successful traversal. */
    async completeScan(
      volumeId: number,
      unseenIds: Iterable<number>,
      scannedDirectoryIds?: Iterable<number>,
    ) {
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

        const directoryIds = scannedDirectoryIds
          ? [...scannedDirectoryIds]
          : undefined
        const scannedAt = new Date()

        if (directoryIds) {
          for (let index = 0; index < directoryIds.length; index += 500) {
            await tx
              .update(entries)
              .set({ childrenDirty: false, childrenScannedAt: scannedAt })
              .where(
                and(
                  eq(entries.volumeId, volumeId),
                  eq(entries.kind, 'directory'),
                  inArray(entries.id, directoryIds.slice(index, index + 500)),
                ),
              )
          }
        } else {
          await tx
            .update(entries)
            .set({ childrenDirty: false, childrenScannedAt: scannedAt })
            .where(
              and(
                eq(entries.volumeId, volumeId),
                eq(entries.kind, 'directory'),
              ),
            )
        }
      })
    },
  }
}

function volumePathCondition(volumeId: number, relativePrefix: string) {
  const volume = eq(entries.volumeId, volumeId)

  if (!relativePrefix) {
    return volume
  }

  const descendantPrefix = `${relativePrefix}/`

  return and(
    volume,
    or(
      entryPathCondition(volumeId, relativePrefix),
      eq(entries.parentPath, relativePrefix),
      and(
        gte(entries.parentPath, descendantPrefix),
        lt(entries.parentPath, `${descendantPrefix}\uffff`),
      ),
    ),
  )
}

function entryPathCondition(volumeId: number, relativePath: string) {
  if (!relativePath) {
    return and(eq(entries.volumeId, volumeId), isNull(entries.parentId))
  }

  const { parentPath, name } = splitEntryPath(relativePath)

  return and(
    eq(entries.volumeId, volumeId),
    eq(entries.parentPath, parentPath),
    eq(entries.name, name),
  )
}

function splitEntryPath(relativePath: string) {
  const separatorIndex = relativePath.lastIndexOf('/')

  return {
    parentPath: separatorIndex < 0 ? '' : relativePath.slice(0, separatorIndex),
    name:
      separatorIndex < 0
        ? relativePath
        : relativePath.slice(separatorIndex + 1),
  }
}

function ancestorPaths(relativePath: string) {
  if (!relativePath) {
    return []
  }

  const paths = ['']
  const segments = relativePath.split('/').filter(Boolean)

  for (let index = 1; index < segments.length; index++) {
    paths.push(segments.slice(0, index).join('/'))
  }

  return paths
}

/** Shared by individual API writes and scanner-owned batch transactions. */
export async function upsertEntry(
  db: Pick<Database, 'insert'>,
  values: NewEntry,
) {
  const { parentPath, name } = splitEntryPath(values.relativePath)
  const physicalName = values.relativePath ? name : ''
  const displayName = physicalName === values.name ? null : values.name
  const { relativePath: _relativePath, ...entryValues } = values

  const [entry] = await db
    .insert(entries)
    .values({
      ...entryValues,
      name: physicalName,
      parentPath,
      displayName,
    })
    .onConflictDoUpdate({
      target: [entries.volumeId, entries.parentPath, entries.name],
      set: {
        ...entryValues,
        name: physicalName,
        parentPath,
        displayName,
      },
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
  const previousChildren = await db
    .select({
      id: entries.id,
      name: entries.name,
      kind: entries.kind,
      modifiedAt: entries.modifiedAt,
      childrenDirty: entries.childrenDirty,
      childrenScannedAt: entries.childrenScannedAt,
    })
    .from(entries)
    .where(eq(entries.parentId, directory.id))
  const previousByName = new Map(
    previousChildren.map((child) => [child.name, child]),
  )
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
      const previous = previousByName.get(child.name)
      const unchangedDirectory =
        kind === 'directory' &&
        previous?.kind === 'directory' &&
        previous.modifiedAt?.getTime() === metadata.mtime.getTime()

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
        childrenScannedAt:
          kind === 'directory' && unchangedDirectory
            ? previous.childrenScannedAt
            : null,
        childrenDirty:
          kind === 'directory'
            ? unchangedDirectory
              ? previous.childrenDirty
              : true
            : false,
      })
    } catch {
      // Files may disappear or become inaccessible while a directory is read.
    }
  }

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
