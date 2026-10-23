import { randomUUID } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { moveItems, moveOperations } from '../db/schemas/moveHistory.js'

type PlannedMove = {
  sourcePath: string
  targetPath: string
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createMoveHistoryApi(db: Database) {
  return {
    async plan(items: PlannedMove[]) {
      const operationId = randomUUID()
      const createdAt = new Date()
      const plannedItems = items.map((item, sequence) => ({
        ...item,
        id: randomUUID(),
        operationId,
        sequence,
        status: 'pending',
        createdAt,
      }))

      await db.transaction(async (transaction) => {
        await transaction.insert(moveOperations).values({
          id: operationId,
          status: 'pending',
          createdAt,
        })
        await transaction.insert(moveItems).values(plannedItems)
      })

      return { id: operationId, items: plannedItems }
    },
    async markItemMoved(id: string) {
      await db
        .update(moveItems)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(moveItems.id, id))
    },
    async complete(id: string) {
      await db
        .update(moveOperations)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(moveOperations.id, id))
    },
    async fail(id: string, error: unknown) {
      await db
        .update(moveOperations)
        .set({
          status: 'failed',
          completedAt: new Date(),
          error: errorMessage(error),
        })
        .where(eq(moveOperations.id, id))
    },
    async list() {
      const operations = await db
        .select()
        .from(moveOperations)
        .orderBy(desc(moveOperations.createdAt))
      const items = await db
        .select()
        .from(moveItems)
        .orderBy(asc(moveItems.createdAt), asc(moveItems.sequence))
      const itemsByOperation = new Map<string, typeof items>()

      for (const item of items) {
        const operationItems = itemsByOperation.get(item.operationId) ?? []

        operationItems.push(item)
        itemsByOperation.set(item.operationId, operationItems)
      }

      return operations.map((operation) => ({
        ...operation,
        items: itemsByOperation.get(operation.id) ?? [],
      }))
    },
  }
}
