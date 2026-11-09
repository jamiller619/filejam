import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import {
  entryAppearance,
  iconAssets,
  pendingAppearance,
} from '../db/schemas/appearance.js'
import { collections } from '../db/schemas/collection.js'
import { entries } from '../db/schemas/entry.js'
import { moveItems } from '../db/schemas/moveHistory.js'
import { type IconTarget, parseIcon } from '../icons.js'

export function createAppearanceApi(db: Database) {
  return {
    async list() {
      const entryIcons = await db
        .select({
          libraryId: entries.libraryId,
          relativePath: entries.relativePath,
          icon: entryAppearance.icon,
        })
        .from(entryAppearance)
        .innerJoin(entries, eq(entries.id, entryAppearance.entryId))
      const collectionIcons = await db
        .select({ id: collections.id, icon: collections.icon })
        .from(collections)

      return [
        ...entryIcons.map(({ libraryId, relativePath, icon }) => ({
          target: { kind: 'entry', libraryId, relativePath } as IconTarget,
          icon,
        })),
        ...collectionIcons
          .filter((row) => row.icon !== null)
          .map(({ id, icon }) => ({
            target: { kind: 'collection', id } as IconTarget,
            icon,
          })),
      ]
    },
    async set(target: IconTarget, input: unknown) {
      const icon = parseIcon(input)

      if (icon?.kind === 'upload') {
        const [asset] = await db
          .select()
          .from(iconAssets)
          .where(eq(iconAssets.id, icon.assetId))

        if (!asset) {
          throw new Error('Uploaded icon not found')
        }
      }

      if (target?.kind === 'collection' && typeof target.id === 'string') {
        const updated = await db
          .update(collections)
          .set({ icon, updatedAt: new Date() })
          .where(eq(collections.id, target.id))
          .returning({ id: collections.id })

        if (!updated.length) {
          throw new Error('Collection not found')
        }

        return icon
      }

      if (
        target?.kind !== 'entry' ||
        !Number.isSafeInteger(target.libraryId) ||
        typeof target.relativePath !== 'string'
      ) {
        throw new Error('Invalid icon target')
      }

      const [entry] = await db
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.libraryId, target.libraryId),
            eq(entries.relativePath, target.relativePath),
          ),
        )

      if (!entry) {
        throw new Error(
          'This item has not been indexed yet. Try again after scanning.',
        )
      }

      if (icon) {
        await db
          .insert(entryAppearance)
          .values({ entryId: entry.id, icon })
          .onConflictDoUpdate({
            target: entryAppearance.entryId,
            set: { icon },
          })
      } else {
        await db
          .delete(entryAppearance)
          .where(eq(entryAppearance.entryId, entry.id))
      }

      return icon
    },
    // Asset registration is main-process only; renderer writes go through import.
    async registerAsset(id: string) {
      if (!/^[a-f0-9]{64}$/.test(id)) {
        throw new Error('Invalid asset ID')
      }

      await db
        .insert(iconAssets)
        .values({ id, createdAt: new Date() })
        .onConflictDoNothing()
    },
    /** Called before renderer startup; allow abandoned imports a day's grace. */
    async collectUnusedAssets() {
      const used = new Set<string>()
      const remember = (icon: unknown) => {
        const value = parseIcon(icon)

        if (value?.kind === 'upload') {
          used.add(value.assetId)
        }
      }

      for (const row of await db.select().from(entryAppearance)) {
        remember(row.icon)
      }

      for (const row of await db.select().from(collections)) {
        remember(row.icon)
      }

      for (const row of await db.select().from(pendingAppearance)) {
        remember(row.icon)
      }

      for (const item of await db.select().from(moveItems)) {
        if (item.status !== 'completed') {
          for (const row of item.appearance ?? []) {
            remember(row.icon)
          }
        }
      }

      const removed: string[] = []
      const cutoff = Date.now() - 24 * 60 * 60 * 1000

      for (const asset of await db.select().from(iconAssets)) {
        if (!used.has(asset.id) && asset.createdAt.getTime() < cutoff) {
          await db.delete(iconAssets).where(eq(iconAssets.id, asset.id))
          removed.push(asset.id)
        }
      }

      return removed
    },
  }
}
