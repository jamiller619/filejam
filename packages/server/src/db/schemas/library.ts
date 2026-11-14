import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const libraries = sqliteTable('libraries', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),

  // Absolute filesystem path to the library directory.
  rootPath: text('root_path').notNull().unique(),
  // Stable semantic identity supplied by the host, independent of the name.
  typeId: text('type_id'),
  isTrash: integer('is_trash', { mode: 'boolean' }).notNull().default(false),
})

export type Library = typeof libraries.$inferSelect
