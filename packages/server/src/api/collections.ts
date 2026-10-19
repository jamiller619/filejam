import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { collectionEntries, collections } from '../db/schemas/collection.js'
import { entries } from '../db/schemas/entry.js'
import { mergeTags } from '../metadata/tags.js'

export function createCollectionsApi(db: Database) {
  const requireCollection = async (id: string) => {
    if (typeof id !== 'string' || !id || id.length > 100) {
      throw new Error('Invalid collection')
    }

    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))

    if (!collection) {
      throw new Error('Collection not found')
    }

    return collection
  }

  const setMembership = async (
    id: string,
    entryId: number,
    included: boolean,
  ) => {
    await requireCollection(id)

    if (
      !Number.isSafeInteger(entryId) ||
      entryId <= 0 ||
      typeof included !== 'boolean'
    ) {
      throw new Error('Invalid file reference')
    }

    const [entry] = await db
      .select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.kind, 'file')))

    if (!entry) {
      throw new Error('File not found')
    }

    if (included) {
      const values = { collectionId: id, entryId, addedAt: new Date() }

      if (id === 'recents') {
        await db
          .insert(collectionEntries)
          .values(values)
          .onConflictDoUpdate({
            target: [collectionEntries.collectionId, collectionEntries.entryId],
            set: { addedAt: values.addedAt },
          })
      } else {
        await db.insert(collectionEntries).values(values).onConflictDoNothing()
      }
    } else {
      await db
        .delete(collectionEntries)
        .where(
          and(
            eq(collectionEntries.collectionId, id),
            eq(collectionEntries.entryId, entryId),
          ),
        )
    }
  }

  return {
    list: async () =>
      db.select().from(collections).orderBy(asc(collections.name)),
    async create(name: string) {
      if (
        typeof name !== 'string' ||
        !name.trim() ||
        name.trim().length > 100
      ) {
        throw new Error('Invalid collection name')
      }

      const collection = { id: randomUUID(), name: name.trim() }

      await db.insert(collections).values(collection)

      return collection
    },
    async listEntries(id: string) {
      const collection = await requireCollection(id)

      const rows = await db
        .select({ entry: entries })
        .from(collectionEntries)
        .innerJoin(entries, eq(entries.id, collectionEntries.entryId))
        .where(eq(collectionEntries.collectionId, id))
        .orderBy(desc(collectionEntries.addedAt), asc(entries.id))

      return {
        collection,
        scanned: true,
        entries: rows.map(({ entry }) => ({
          ...entry,
          tags: mergeTags(entry),
        })),
      }
    },
    async forEntry(entryId: number) {
      if (!Number.isSafeInteger(entryId) || entryId <= 0) {
        throw new Error('Invalid file reference')
      }

      return db
        .select({ id: collectionEntries.collectionId })
        .from(collectionEntries)
        .where(eq(collectionEntries.entryId, entryId))
    },
    async setMembership(id: string, entryId: number, included: boolean) {
      if (id === 'recents') {
        throw new Error('Recents is managed automatically')
      }

      await setMembership(id, entryId, included)
    },
    recordView: (entryId: number) => setMembership('recents', entryId, true),
  }
}
