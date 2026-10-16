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
import { libraries } from './library.js'

export const entries = sqliteTable(
  'entries',
  {
    id: integer('id').primaryKey(),

    libraryId: integer('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),

    // The root has no parent; deleting a directory cascades through its subtree.
    parentId: integer('parent_id').references(
      (): AnySQLiteColumn => entries.id,
      { onDelete: 'cascade' },
    ),

    name: text('name').notNull(),

    // Relative to libraries.rootPath, using "/" separators.
    // The library root itself uses "".
    relativePath: text('relative_path').notNull(),

    kind: text('kind', {
      enum: ['directory', 'file', 'symlink'],
    }).notNull(),

    // File metadata; nullable for directories or unknown values.
    size: integer('size'),
    mimeType: text('mime_type'),
    // Sources stay separate so importing metadata never overwrites user tags.
    appTags: text('app_tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    osTags: text('os_tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    embeddedTags: text('embedded_tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    tagReadError: text('tag_read_error'),
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
    uniqueIndex('entries_library_path_unique').on(
      table.libraryId,
      table.relativePath,
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
export type NewEntry = typeof entries.$inferInsert
