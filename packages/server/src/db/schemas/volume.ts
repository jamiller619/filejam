import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const volumes = sqliteTable('volumes', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().unique(),
  kind: text('kind', {
    enum: ['system', 'internal', 'external', 'removable', 'network', 'virtual'],
  })
    .notNull()
    .default('internal'),
  typeId: text('type_id'),
  isTrash: integer('is_trash', { mode: 'boolean' }).notNull().default(false),
})

export type Volume = typeof volumes.$inferSelect
