import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Completed one-time setup tasks, persisted with the data they initialize. */
export const initialization = sqliteTable('initialization', {
  key: text('key').primaryKey(),
})
