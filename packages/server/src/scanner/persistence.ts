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
  scanPath = root,
) {
  const connection = await initDatabase(databasePath, runMigrations)
  const api = createApi(connection.db)

  try {
    const volume = await api.volumes.ensure(root)
    const isTrash = await api.volumes.isTrashRoot(root)
    const pathKey = (path: string) => relative(root, path).split(sep).join('/')
    const scopeKey = pathKey(scanPath)
    // Start with all stored paths; committed batches remove encountered paths.
    // Remaining rows are deletion candidates only if the entire scan succeeds.
    const unseen = new Map(
      (await api.entries.listScanEntries(volume.id, scopeKey)).map((entry) => [
        entry.path,
        entry,
      ]),
    )
    const directories = new Map<string, number>()

    for (const entry of unseen.values()) {
      if (entry.kind === 'directory') {
        directories.set(entry.path, entry.id)
      }
    }

    for (const entry of await api.entries.listDirectoryAncestors(
      volume.id,
      scopeKey,
    )) {
      directories.set(entry.path, entry.id)
    }
    const scannedDirectories = new Set<number>()
    let tracksScannedDirectories = false

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
          saved.push({ path, kind: values.kind })
        }
      }

      return saved
    }

    function inspect(path: string, metadata: Stats) {
      const key = pathKey(path)
      const baseline = unseen.get(key)

      if (!baseline) {
        return { change: 'added' as const, save: true }
      }

      if (
        metadata.isFile() &&
        baseline.kind === 'file' &&
        baseline.size === metadata.size &&
        baseline.modifiedAt?.getTime() === metadata.mtime.getTime()
      ) {
        unseen.delete(key)

        return { change: 'unchanged' as const, save: false }
      }

      return { change: 'changed' as const, save: true }
    }

    return {
      async close() {
        connection.close()
      },
      inspect,
      skipUnchanged(path: string, metadata: Stats) {
        return !inspect(path, metadata).save
      },
      saveBatch,
      directoryScanned(path: string) {
        tracksScannedDirectories = true

        const id = directories.get(pathKey(path))

        if (id !== undefined) {
          scannedDirectories.add(id)
        }
      },
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
      // An incomplete traversal cannot distinguish deleted entries from entries
      // it has not reached, so callers disable deletion reconciliation.
      async complete(reconcileDeletions = true, collectPaths = false) {
        const removedPaths: string[] = []
        let removedCount = 0

        if (reconcileDeletions) {
          for (const entry of unseen.values()) {
            if (entry.kind !== 'file') {
              continue
            }

            removedCount++

            if (collectPaths) {
              removedPaths.push(entry.path.split('/').join(sep))
            }
          }
        }

        await api.entries.completeScan(
          volume.id,
          reconcileDeletions
            ? Array.from(unseen.values(), (entry) => entry.id)
            : [],
          tracksScannedDirectories ? scannedDirectories : undefined,
        )

        return { removedCount, removedPaths }
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
