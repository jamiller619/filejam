import { basename } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import type { Database } from '../db/index.js'
import { type Volume, volumes } from '../db/schemas/volume.js'

export type VolumeInput = Pick<Volume, 'name' | 'rootPath' | 'kind'> & {
  typeId?: string | null
  isTrash?: boolean
}

export function createVolumesApi(db: Database) {
  return {
    async sync(inputs: VolumeInput[]) {
      const currentRoots = new Set(inputs.map((input) => input.rootPath))

      for (const input of inputs) {
        await ensureVolume(db, input)
      }

      const existing = await db
        .select({ id: volumes.id, rootPath: volumes.rootPath })
        .from(volumes)
        .where(eq(volumes.isTrash, false))

      for (const volume of existing) {
        if (!currentRoots.has(volume.rootPath)) {
          await db.delete(volumes).where(eq(volumes.id, volume.id))
        }
      }

      return this.list()
    },

    async ensure(
      input: string | VolumeInput,
    ): Promise<Pick<Volume, 'id' | 'name' | 'rootPath' | 'kind'>> {
      const value: VolumeInput =
        typeof input === 'string'
          ? {
              name: basename(input) || input,
              rootPath: input,
              kind: 'internal',
            }
          : input

      return ensureVolume(db, value)
    },

    async ensureTrashRoots(roots: string[]): Promise<Volume[]> {
      const result: Volume[] = []
      const uniqueRoots = [...new Set(roots)]

      for (const rootPath of uniqueRoots) {
        const [volume] = await db
          .insert(volumes)
          .values({
            name: 'Trash',
            rootPath,
            kind: 'virtual',
            isTrash: true,
          })
          .onConflictDoUpdate({
            target: volumes.rootPath,
            set: { name: 'Trash', kind: 'virtual', isTrash: true },
          })
          .returning()

        if (volume) {
          result.push(volume)
        }
      }

      const retainedRoots = new Set(uniqueRoots)
      const previousTrashRoots = await db
        .select({ id: volumes.id, rootPath: volumes.rootPath })
        .from(volumes)
        .where(eq(volumes.isTrash, true))

      for (const volume of previousTrashRoots) {
        if (!retainedRoots.has(volume.rootPath)) {
          await db.delete(volumes).where(eq(volumes.id, volume.id))
        }
      }

      return result
    },

    async isTrashRoot(rootPath: string): Promise<boolean> {
      const [volume] = await db
        .select({ isTrash: volumes.isTrash })
        .from(volumes)
        .where(eq(volumes.rootPath, rootPath))

      return volume?.isTrash ?? false
    },

    async list(): Promise<Volume[]> {
      return db
        .select()
        .from(volumes)
        .orderBy(asc(volumes.name), asc(volumes.id))
    },
  }
}

async function ensureVolume(db: Database, value: VolumeInput) {
  const [volume] = await db
    .insert(volumes)
    .values(value)
    .onConflictDoUpdate({
      target: volumes.rootPath,
      set: {
        name: value.name,
        kind: value.kind,
        typeId: value.typeId ?? null,
        isTrash: value.isTrash ?? false,
      },
    })
    .returning({
      id: volumes.id,
      name: volumes.name,
      rootPath: volumes.rootPath,
      kind: volumes.kind,
    })

  if (!volume) {
    throw new Error('Unable to register volume')
  }

  return volume
}
