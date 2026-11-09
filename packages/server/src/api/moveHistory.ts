import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { entryAppearance, pendingAppearance } from '../db/schemas/appearance.js'
import { entries } from '../db/schemas/entry.js'
import { libraries } from '../db/schemas/library.js'
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
      const roots = await db.select().from(libraries)
      const appearances = await db
        .select({
          libraryId: entries.libraryId,
          relativePath: entries.relativePath,
          icon: entryAppearance.icon,
        })
        .from(entryAppearance)
        .innerJoin(entries, eq(entries.id, entryAppearance.entryId))
      const contains = (root: string, path: string) => {
        const child = relative(root, path)

        return (
          !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`)
        )
      }
      const snapshots = items.map((item) =>
        appearances.flatMap((appearance) => {
          const sourceRoot = roots.find(
            (root) => root.id === appearance.libraryId,
          )

          if (!sourceRoot) {
            return []
          }

          const source = resolve(sourceRoot.rootPath, appearance.relativePath)

          if (!contains(item.sourcePath, source)) {
            return []
          }

          const destination = resolve(
            item.targetPath,
            relative(item.sourcePath, source),
          )
          const targetRoot = roots
            .filter((root) => contains(root.rootPath, destination))
            .sort((a, b) => b.rootPath.length - a.rootPath.length)[0]

          return targetRoot
            ? [
                {
                  libraryId: targetRoot.id,
                  relativePath: relative(targetRoot.rootPath, destination)
                    .split(sep)
                    .join('/'),
                  icon: appearance.icon,
                },
              ]
            : []
        }),
      )
      const plannedItems = items.map((item, sequence) => ({
        ...item,
        appearance: snapshots[sequence] ?? [],
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
      await db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(moveItems)
          .where(eq(moveItems.id, id))

        if (!item || item.status === 'completed') {
          return
        }

        for (const appearance of item.appearance ?? []) {
          const [entry] = await tx
            .select({ id: entries.id })
            .from(entries)
            .where(
              and(
                eq(entries.libraryId, appearance.libraryId),
                eq(entries.relativePath, appearance.relativePath),
              ),
            )

          if (entry) {
            await tx
              .insert(entryAppearance)
              .values({ entryId: entry.id, icon: appearance.icon })
              .onConflictDoUpdate({
                target: entryAppearance.entryId,
                set: { icon: appearance.icon },
              })
          } else {
            await tx
              .insert(pendingAppearance)
              .values(appearance)
              .onConflictDoUpdate({
                target: [
                  pendingAppearance.libraryId,
                  pendingAppearance.relativePath,
                ],
                set: { icon: appearance.icon },
              })
          }
        }

        await tx
          .update(moveItems)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(moveItems.id, id))
      })
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
