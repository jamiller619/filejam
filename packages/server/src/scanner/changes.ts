import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { entries } from '../db/schemas/entry.js'
import { libraries } from '../db/schemas/library.js'

/** Preview reads can change access metadata without changing indexed content. */
export async function hasIndexedPathChanged(
  db: Database,
  root: string,
  path: string,
) {
  const [entry] = await db
    .select({
      kind: entries.kind,
      size: entries.size,
      modifiedAt: entries.modifiedAt,
      createdAt: entries.createdAt,
    })
    .from(entries)
    .innerJoin(libraries, eq(entries.libraryId, libraries.id))
    .where(
      and(
        eq(libraries.rootPath, root),
        eq(entries.relativePath, path.replaceAll('\\', '/')),
      ),
    )

  if (!entry) {
    return true
  }

  const metadata = await lstat(resolve(root, path))
  let kind: 'file' | 'directory' | 'symlink' = 'file'

  if (metadata.isSymbolicLink()) {
    kind = 'symlink'
  } else if (metadata.isDirectory()) {
    kind = 'directory'
  }

  return (
    entry.kind !== kind ||
    (kind !== 'directory' && entry.size !== metadata.size) ||
    entry.modifiedAt?.getTime() !== metadata.mtime.getTime() ||
    entry.createdAt.getTime() !== metadata.birthtime.getTime()
  )
}
