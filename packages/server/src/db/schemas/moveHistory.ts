import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const moveOperations = sqliteTable('move_operations', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  error: text('error'),
})

export const moveItems = sqliteTable('move_items', {
  id: text('id').primaryKey(),
  operationId: text('operation_id')
    .notNull()
    .references(() => moveOperations.id, { onDelete: 'cascade' }),
  sourcePath: text('source_path').notNull(),
  targetPath: text('target_path').notNull(),
  sequence: integer('sequence').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})

export type MoveOperation = typeof moveOperations.$inferSelect
export type MoveItem = typeof moveItems.$inferSelect
