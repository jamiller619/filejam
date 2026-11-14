import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { CustomIcon } from '../../icons.js'
import { entries } from './entry.js'
import { libraries } from './library.js'

export const entryAppearance = sqliteTable('entry_appearance', {
  entryId: integer('entry_id')
    .primaryKey()
    .references(() => entries.id, { onDelete: 'cascade' }),
  icon: text('icon', { mode: 'json' }).$type<CustomIcon>().notNull(),
})

// A durable bridge between a filesystem move and the next scanner insertion.
export const pendingAppearance = sqliteTable(
  'pending_appearance',
  {
    libraryId: integer('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    relativePath: text('relative_path').notNull(),
    icon: text('icon', { mode: 'json' }).$type<CustomIcon>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.libraryId, table.relativePath] })],
)

export const iconAssets = sqliteTable('icon_assets', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
