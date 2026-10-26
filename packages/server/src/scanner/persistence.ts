import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import mime from 'mime'
import { upsertEntry } from '../api/entries.js'
import { createApi } from '../api/index.js'
import { initDatabase } from '../db/index.js'

/** Open a worker-owned connection. Pools migrate once before dispatching scans. */
export async function openScanDatabase(
  databasePath: string,
  root: string,
  runMigrations = true,
) {
  const connection = await initDatabase(databasePath, runMigrations)
  const api = createApi(connection.db)

  try {
    const volume = await api.volumes.ensure(root)
    const isTrash = await api.volumes.isTrashRoot(root)
    const previous = await api.entries.listPaths(volume.id)
    // Start with all stored paths; committed batches remove encountered paths.
    // Remaining rows are deletion candidates only if the entire scan succeeds.
    const unseen = new Map(previous.map((entry) => [entry.path, entry.id]))
    const persisted = new Set(unseen.keys())
    const directories = new Map<string, number>()
    const pathKey = (path: string) => relative(root, path).split(sep).join('/')

    async function prepare(path: string, snapshot?: Stats) {
      // Filesystem reads finish before opening a write transaction. Parent IDs
      // are resolved later, in parent-first order.
      const metadata = snapshot ?? (await stat(path))
      const key = pathKey(path)

      const kind = metadata.isDirectory()
        ? 'directory'
        : metadata.isSymbolicLink()
          ? 'symlink'
          : 'file'

      const name = isTrash
        ? await getTrashEntryName(root, path)
        : basename(path) || root

      return {
        path,
        parentKey: key === '' ? null : pathKey(dirname(path)),
        values: {
          volumeId: volume.id,
          relativePath: key,
          name,
          kind,
          size: kind === 'directory' ? null : metadata.size,
          mimeType:
            kind === 'file'
              ? (mime.getType(name) ?? 'application/octet-stream')
              : null,
          modifiedAt: metadata.mtime,
          createdAt: metadata.birthtime,
          indexedAt: new Date(),
          childrenDirty: kind === 'directory',
        },
      } as const
    }

    async function saveBatch(
      paths: string[],
      metadata?: ReadonlyMap<string, Stats>,
      isCancelled = () => false,
    ) {
      const saved: { path: string; kind: 'directory' | 'symlink' | 'file' }[] =
        []

      for (let index = 0; index < paths.length; index += 64) {
        const prepared: Awaited<ReturnType<typeof prepare>>[] = []

        for (const path of paths.slice(index, index + 64)) {
          if (isCancelled()) {
            return saved
          }

          prepared.push(await prepare(path, metadata?.get(path)))
        }

        if (isCancelled()) {
          return saved
        }

        if (!prepared.length) {
          continue
        }

        const newDirectories = new Map<string, number>()

        await connection.db.transaction(async (tx) => {
          for (const { path, parentKey, values } of prepared) {
            const parentId =
              parentKey === null
                ? null
                : (newDirectories.get(parentKey) ?? directories.get(parentKey))

            if (parentId === undefined) {
              throw new Error(`Missing parent directory for ${path}`)
            }

            const entry = await upsertEntry(tx, { ...values, parentId })

            if (values.kind === 'directory') {
              newDirectories.set(values.relativePath, entry.id)
            }
          }
        })

        // Publish bookkeeping only after commit, so a rolled-back batch never
        // contributes parent IDs or hides stale rows from reconciliation.
        for (const [key, id] of newDirectories) {
          directories.set(key, id)
        }

        for (const { path, values } of prepared) {
          unseen.delete(values.relativePath)
          persisted.add(values.relativePath)
          saved.push({ path, kind: values.kind })
        }
      }

      return saved
    }

    return {
      async close() {
        connection.close()
      },
      skipUnchanged(path: string, metadata: Stats) {
        const key = pathKey(path)

        const exists = persisted.has(key) && !metadata.isDirectory()

        if (exists) {
          unseen.delete(key)
        }

        return exists
      },
      saveBatch,
      async save(path: string, snapshot?: Stats) {
        const [saved] = await saveBatch(
          [path],
          snapshot ? new Map([[path, snapshot]]) : undefined,
        )

        if (!saved) {
          throw new Error(`Unable to save ${path}`)
        }

        return saved.kind
      },
      // Never call this after cancellation or failure: an incomplete traversal
      // cannot distinguish deleted entries from entries it has not reached.
      async complete() {
        await api.entries.completeScan(volume.id, unseen.values())
      },
    }
  } catch (error) {
    connection.close()

    throw error
  }
}

async function getTrashEntryName(root: string, path: string) {
  const filename = basename(path)

  if (
    process.platform !== 'win32' ||
    filename.length < 3 ||
    !filename.startsWith('$R') ||
    relative(root, path).includes(sep)
  ) {
    return filename || root
  }

  try {
    const metadata = await readFile(join(root, `$I${filename.slice(2)}`))
    const version = metadata.readBigUInt64LE(0)
    const pathOffset = version === 2n ? 28 : 24

    const originalPath = metadata
      .subarray(pathOffset)
      .toString('utf16le')
      .replace(/\0+$/, '')

    return basename(originalPath) || filename
  } catch {
    return filename
  }
}
