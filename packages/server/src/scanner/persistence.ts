import { lstat, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import mime from 'mime'
import { createApi } from '../api/index.js'
import { initDatabase } from '../db/index.js'
import { createTagReader } from '../metadata/readTags.js'

/** Open a worker-owned connection and reconcile one library over a scan. */
export async function openScanDatabase(databasePath: string, root: string) {
  const connection = await initDatabase(databasePath)
  const api = createApi(connection.db)
  const tagReader = createTagReader()
  try {
    const library = await api.libraries.ensureRoot(root)
    const isTrash = await api.libraries.isTrashRoot(root)
    const previous = await api.entries.listPaths(library.id)
    // Start with all stored paths; save() removes those encountered this time.
    // Remaining rows are deletion candidates only if the entire scan succeeds.
    const unseen = new Map(previous.map((entry) => [entry.path, entry.id]))
    const persisted = new Set(unseen.keys())
    const directories = new Map<string, number>()
    const pathKey = (path: string) => relative(root, path).split(sep).join('/')

    return {
      async close() {
        connection.close()
        await tagReader.close()
      },
      prepareTags: (paths: string[]) => tagReader.prepare(paths),
      async skipUnchanged(path: string) {
        const key = pathKey(path)
        const metadata = await lstat(path)
        const exists =
          persisted.has(key) &&
          !metadata.isDirectory() &&
          !metadata.isSymbolicLink()
        if (exists) unseen.delete(key)
        return exists
      },
      async save(path: string) {
        // lstat records the link itself rather than its target.
        const metadata = await lstat(path)
        const key = pathKey(path)
        const parentId =
          key === '' ? null : directories.get(pathKey(dirname(path)))
        if (parentId === undefined)
          throw new Error(`Missing parent directory for ${path}`)
        const kind = metadata.isDirectory()
          ? 'directory'
          : metadata.isSymbolicLink()
            ? 'symlink'
            : 'file'
        const name = isTrash
          ? await getTrashEntryName(root, path)
          : basename(path) || root
        const values = {
          ...(await tagReader.read(path, kind)),
          libraryId: library.id,
          parentId,
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
        } as const
        const entry = await api.entries.upsert(values)
        unseen.delete(key)
        persisted.add(key)
        if (kind === 'directory') directories.set(key, entry.id)
        return kind
      },
      // Never call this after cancellation or failure: an incomplete traversal
      // cannot distinguish deleted entries from entries it has not reached.
      async complete() {
        await api.entries.completeScan(library.id, unseen.values())
      },
    }
  } catch (error) {
    connection.close()
    await tagReader.close()
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
  ) return filename || root

  try {
    const metadata = await readFile(join(root, `$I${filename.slice(2)}`))
    const version = metadata.readBigUInt64LE(0)
    const pathOffset = version === 2n ? 28 : 24
    const originalPath = metadata.subarray(pathOffset).toString('utf16le').replace(/\0+$/, '')
    return basename(originalPath) || filename
  } catch {
    return filename
  }
}
