import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { volumes } from './volume.js'

export const entries = sqliteTable(
  'entries',
  {
    id: integer('id').primaryKey(),

    volumeId: integer('volume_id')
      .notNull()
      .references(() => volumes.id, { onDelete: 'cascade' }),

    // The root has no parent; deleting a directory cascades through its subtree.
    parentId: integer('parent_id').references(
      (): AnySQLiteColumn => entries.id,
      { onDelete: 'cascade' },
    ),

    // Physical filesystem name. The volume root uses ""; most other entries
    // expose this directly.
    name: text('name').notNull(),

    // The containing directory relative to volumes.rootPath, using "/"
    // separators. Entries directly inside the volume use "".
    parentPath: text('parent_path').notNull().default(''),

    // Only set when a virtual filesystem has a different user-facing name.
    // Windows Trash entries are the common example.
    displayName: text('display_name'),

    kind: text('kind', {
      enum: ['directory', 'file', 'symlink'],
    }).notNull(),

    // File metadata; nullable for directories or unknown values.
    size: integer('size'),
    mimeType: text('mime_type'),
    modifiedAt: integer('modified_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),

    // When this entry's filesystem metadata was last refreshed.
    indexedAt: integer('indexed_at', {
      mode: 'timestamp_ms',
    }).notNull(),

    // Directories only: last successful listing of immediate children.
    // Null means children have not been loaded yet.
    childrenScannedAt: integer('children_scanned_at', {
      mode: 'timestamp_ms',
    }),

    // Scanning marks visited directories dirty until the full scan succeeds.
    // A cancelled/failed scan leaves those listings potentially incomplete.
    childrenDirty: integer('children_dirty', {
      mode: 'boolean',
    })
      .notNull()
      .default(true),
  },
  (table) => [
    uniqueIndex('entries_volume_parent_name_unique').on(
      table.volumeId,
      table.parentPath,
      table.name,
    ),

    // Supports listing a folder's children alphabetically.
    index('entries_parent_name_idx').on(table.parentId, table.name),

    check(
      'entries_kind_check',
      sql`${table.kind} IN ('directory', 'file', 'symlink')`,
    ),
  ],
)

export type Entry = typeof entries.$inferSelect

type StoredNewEntry = typeof entries.$inferInsert

// Callers work with complete relative paths; upsertEntry normalizes them into
// the non-redundant name + parentPath representation used by the database.
export type NewEntry = Omit<
  StoredNewEntry,
  'name' | 'parentPath' | 'displayName'
> & {
  name: string
  relativePath: string
}
