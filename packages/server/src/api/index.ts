import type { Database } from '../db/index.js'
import { createAppearanceApi } from './appearance.js'
import { createCollectionsApi } from './collections.js'
import { createEntriesApi } from './entries.js'
import { createLibrariesApi } from './libraries.js'

export function createApi(db: Database) {
  return {
    appearance: createAppearanceApi(db),
    collections: createCollectionsApi(db),
    libraries: createLibrariesApi(db),
    entries: createEntriesApi(db),
  }
}

export type ServerApi = ReturnType<typeof createApi>

export type { Library } from '../db/schemas/library.js'
