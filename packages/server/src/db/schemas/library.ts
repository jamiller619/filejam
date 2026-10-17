import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const libraries = sqliteTable('libraries', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),

  // Absolute filesystem path to the library directory.
  rootPath: text('root_path').notNull().unique(),
  isTrash: integer('is_trash', { mode: 'boolean' }).notNull().default(false),
})

export type Library = typeof libraries.$inferSelect
