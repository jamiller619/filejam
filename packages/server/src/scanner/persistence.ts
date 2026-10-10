import { lstat } from 'node:fs/promises'
import { basename, dirname, relative, sep } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { initDatabase } from '../db/index.js'
import { entries } from '../db/schemas/entry.js'
import { libraries } from '../db/schemas/library.js'

/** Open a worker-owned connection and reconcile one library over a scan. */
export async function openScanDatabase(databasePath: string, root: string) {
  const connection = await initDatabase(databasePath)
  const { db } = connection
  try {
    // Reuse the library for this canonical root without overwriting its name.
    const [library] = await db
      .insert(libraries)
      .values({ name: basename(root) || root, rootPath: root })
      .onConflictDoUpdate({
        target: libraries.rootPath,
        set: { rootPath: root },
      })
      .returning()
    if (!library) throw new Error('Unable to create scan library')
    const previous = await db
      .select({ id: entries.id, path: entries.relativePath })
      .from(entries)
      .where(eq(entries.libraryId, library.id))
    // Start with all stored paths; save() removes those encountered this time.
    // Remaining rows are deletion candidates only if the entire scan succeeds.
    const unseen = new Map(previous.map((entry) => [entry.path, entry.id]))
    const directories = new Map<string, number>()
    const pathKey = (path: string) => relative(root, path).split(sep).join('/')
    return {
      close: connection.close,
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
        const values = {
          libraryId: library.id,
          parentId,
          relativePath: key,
          name: basename(path) || root,
          kind,
          size: kind === 'directory' ? null : metadata.size,
          modifiedAt: metadata.mtime,
          indexedAt: new Date(),
          childrenDirty: kind === 'directory',
        } as const
        // Upsert by library/path to preserve IDs and existing parent references.
        const [entry] = await db
          .insert(entries)
          .values(values)
          .onConflictDoUpdate({
            target: [entries.libraryId, entries.relativePath],
            set: values,
          })
          .returning({ id: entries.id })
        if (!entry) throw new Error(`Unable to save ${path}`)
        unseen.delete(key)
        if (kind === 'directory') directories.set(key, entry.id)
        return kind
      },
      // Never call this after cancellation or failure: an incomplete traversal
      // cannot distinguish deleted entries from entries it has not reached.
      async complete() {
        await db.transaction(async (tx) => {
          for (const id of unseen.values()) {
            await tx
              .delete(entries)
              .where(and(eq(entries.libraryId, library.id), eq(entries.id, id)))
          }
          await tx
            .update(entries)
            .set({ childrenDirty: false, childrenScannedAt: new Date() })
            .where(
              and(
                eq(entries.libraryId, library.id),
                eq(entries.kind, 'directory'),
              ),
            )
        })
      },
    }
  } catch (error) {
    connection.close()
    throw error
  }
}
