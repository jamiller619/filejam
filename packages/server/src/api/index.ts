import type { Database } from '../db/index.js'
import { createCollectionsApi } from './collections.js'
import { createEntriesApi } from './entries.js'
import { createLibrariesApi } from './libraries.js'
import { createMoveHistoryApi } from './moveHistory.js'

export function createApi(db: Database) {
  return {
    collections: createCollectionsApi(db),
    libraries: createLibrariesApi(db),
    moveHistory: createMoveHistoryApi(db),
    entries: createEntriesApi(db),
  }
}

export type ServerApi = ReturnType<typeof createApi>

export type { Library } from '../db/schemas/library.js'
