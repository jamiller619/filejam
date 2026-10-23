import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { entries } from './entry.js'

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  definition: text('definition').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const entryStates = sqliteTable('entry_states', {
  entryId: integer('entry_id')
    .primaryKey()
    .references(() => entries.id, { onDelete: 'cascade' }),
  lastOpenedAt: integer('last_opened_at', { mode: 'timestamp_ms' }),
  favoritedAt: integer('favorited_at', { mode: 'timestamp_ms' }),
})
