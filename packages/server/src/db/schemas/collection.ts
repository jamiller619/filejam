import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { entries } from './entry.js'

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

export const collectionEntries = sqliteTable(
  'collection_entries',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.entryId] })],
)
