import { randomUUID } from 'node:crypto'
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import {
  type CollectionDefinition,
  type CollectionField,
  type CollectionRule,
  parseCollectionDefinition,
} from '../collections/definition.js'
import type { Database } from '../db/index.js'
import { collections, entryStates } from '../db/schemas/collection.js'
import { entries } from '../db/schemas/entry.js'

type CollectionInput = {
  name: string
  definition: CollectionDefinition
}

export function createCollectionsApi(db: Database) {
  const requireCollection = async (id: string) => {
    if (typeof id !== 'string' || !id || id.length > 100) {
      throw new Error('Invalid collection')
    }

    const [row] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, id))

    if (!row) {
      throw new Error('Collection not found')
    }

    return deserializeCollection(row)
  }

  const requireFile = async (entryId: number) => {
    if (!Number.isSafeInteger(entryId) || entryId <= 0) {
      throw new Error('Invalid file reference')
    }

    const [entry] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.kind, 'file')))

    if (!entry) {
      throw new Error('File not found')
    }
  }

  const list = async () => {
    const rows = await db
      .select()
      .from(collections)
      .orderBy(asc(collections.name), asc(collections.id))

    return rows.map(deserializeCollection)
  }

  return {
    list,
    async create(input: CollectionInput) {
      const value = parseCollectionInput(input)
      const now = new Date()
      const row = {
        id: randomUUID(),
        name: value.name,
        definition: JSON.stringify(value.definition),
        createdAt: now,
        updatedAt: now,
      }

      await db.insert(collections).values(row)

      return deserializeCollection(row)
    },
    async update(id: string, input: CollectionInput) {
      await requireCollection(id)

      const value = parseCollectionInput(input)
      const [row] = await db
        .update(collections)
        .set({
          name: value.name,
          definition: JSON.stringify(value.definition),
          updatedAt: new Date(),
        })
        .where(eq(collections.id, id))
        .returning()

      if (!row) {
        throw new Error('Collection not found')
      }

      return deserializeCollection(row)
    },
    async delete(id: string) {
      await requireCollection(id)
      await db.delete(collections).where(eq(collections.id, id))
    },
    async listEntries(id: string) {
      const collection = await requireCollection(id)
      const definition = collection.definition
      const predicate = compileDefinition(definition)
      const orderBy = definition.sort.map((sort) => {
        const column = fieldColumn(sort.field)

        return sort.direction === 'asc' ? asc(column) : desc(column)
      })

      const query = db
        .select(getTableColumns(entries))
        .from(entries)
        .leftJoin(entryStates, eq(entryStates.entryId, entries.id))
        .where(predicate)
        .orderBy(...orderBy, asc(entries.id))

      const rows = definition.limit
        ? await query.limit(definition.limit)
        : await query

      return { collection, scanned: true, entries: rows }
    },
    async forEntry(entryId: number) {
      if (!Number.isSafeInteger(entryId) || entryId <= 0) {
        throw new Error('Invalid file reference')
      }

      const items = await list()
      const matches = await Promise.all(
        items.map(async (collection) => {
          const [match] = await db
            .select({ id: entries.id })
            .from(entries)
            .leftJoin(entryStates, eq(entryStates.entryId, entries.id))
            .where(
              and(
                eq(entries.id, entryId),
                compileDefinition(collection.definition),
              ),
            )
            .limit(1)

          return match ? { id: collection.id } : null
        }),
      )

      return matches.filter((match): match is { id: string } => match !== null)
    },
    async getEntryState(entryId: number) {
      await requireFile(entryId)

      const [state] = await db
        .select()
        .from(entryStates)
        .where(eq(entryStates.entryId, entryId))

      return {
        lastOpenedAt: state?.lastOpenedAt ?? null,
        favoritedAt: state?.favoritedAt ?? null,
      }
    },
    async setFavorite(entryId: number, included: boolean) {
      await requireFile(entryId)

      if (typeof included !== 'boolean') {
        throw new Error('Invalid favorite state')
      }

      const favoritedAt = included ? new Date() : null

      await db
        .insert(entryStates)
        .values({ entryId, favoritedAt })
        .onConflictDoUpdate({
          target: entryStates.entryId,
          set: { favoritedAt },
        })
    },
    async recordView(entryId: number) {
      await requireFile(entryId)

      const lastOpenedAt = new Date()

      await db
        .insert(entryStates)
        .values({ entryId, lastOpenedAt })
        .onConflictDoUpdate({
          target: entryStates.entryId,
          set: { lastOpenedAt },
        })
    },
  }
}

function parseCollectionInput(input: CollectionInput) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid collection')
  }

  const name = typeof input.name === 'string' ? input.name.trim() : ''

  if (!name || name.length > 100) {
    throw new Error('Invalid collection name')
  }

  return {
    name,
    definition: parseCollectionDefinition(input.definition),
  }
}

function deserializeCollection(row: typeof collections.$inferSelect) {
  return {
    ...row,
    definition: parseCollectionDefinition(JSON.parse(row.definition)),
  }
}

function compileDefinition(definition: CollectionDefinition) {
  const predicates = definition.rules.map(compileRule)

  if (predicates.length === 0) {
    return undefined
  }

  return definition.match === 'all' ? and(...predicates) : or(...predicates)
}

function compileRule(rule: CollectionRule): SQL {
  const column = fieldColumn(rule.field)

  switch (rule.operator) {
    case 'equals':
      return sql`${column} = ${rule.value}`
    case 'notEquals':
      return sql`${column} != ${rule.value}`
    case 'contains':
      return sql`instr(lower(${column}), lower(${rule.value})) > 0`
    case 'startsWith':
      return sql`lower(substr(${column}, 1, length(${rule.value}))) = lower(${rule.value})`
    case 'greaterThan':
      return sql`${column} > ${rule.value}`
    case 'lessThan':
      return sql`${column} < ${rule.value}`
    case 'isSet':
      return sql`${column} is not null`
    case 'isNotSet':
      return sql`${column} is null`
  }
}

function fieldColumn(field: CollectionField) {
  switch (field) {
    case 'name':
      return entries.name
    case 'relativePath':
      return entries.relativePath
    case 'volumeId':
      return entries.volumeId
    case 'kind':
      return entries.kind
    case 'mimeType':
      return entries.mimeType
    case 'size':
      return entries.size
    case 'createdAt':
      return entries.createdAt
    case 'modifiedAt':
      return entries.modifiedAt
    case 'indexedAt':
      return entries.indexedAt
    case 'lastOpenedAt':
      return entryStates.lastOpenedAt
    case 'favoritedAt':
      return entryStates.favoritedAt
  }
}
