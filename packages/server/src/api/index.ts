import type { ConfigStore } from '../config/index.js'
import type { Database } from '../db/index.js'
import { createCollectionsApi } from './collections.js'
import { createConfigApi } from './config.js'
import { createEntriesApi } from './entries.js'
import { createLibrariesApi } from './libraries.js'

export function createApi(db: Database, config?: ConfigStore) {
  return {
    collections: createCollectionsApi(db),
    config: createConfigApi(config),
    libraries: createLibrariesApi(db),
    entries: createEntriesApi(db),
  }
}

export type ServerApi = ReturnType<typeof createApi>

export type { Library } from '../db/schemas/library.js'
