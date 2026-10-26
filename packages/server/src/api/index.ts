import type { Database } from '../db/index.js'
import { createCollectionsApi } from './collections.js'
import { createEntriesApi } from './entries.js'
import { createMoveHistoryApi } from './moveHistory.js'
import { createVolumesApi } from './volumes.js'

export function createApi(db: Database) {
  return {
    collections: createCollectionsApi(db),
    volumes: createVolumesApi(db),
    moveHistory: createMoveHistoryApi(db),
    entries: createEntriesApi(db),
  }
}

export type ServerApi = ReturnType<typeof createApi>

export type { Volume } from '../db/schemas/volume.js'
