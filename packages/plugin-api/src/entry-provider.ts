import type { ENTRY_API_VERSION } from './entry-api-version.js'
import type { EntryKind } from './entry-manifest.js'

export type EntryApiVersion = typeof ENTRY_API_VERSION

export interface EntryRequest {
  path: string
  name: string
  kind: EntryKind
}

export interface EntryResolution {
  typeId: string
  displayName?: string
  icon?: { type: 'native'; path: string }
  activation?: { type: 'open-path'; path: string }
  details?: Readonly<Record<string, string>>
}

export interface EntryContext {
  signal: AbortSignal
  log: (message: string) => void
}

/** Providers execute as trusted installed code in the desktop main process. */
export interface EntryProvider {
  resolve(
    request: EntryRequest,
    context: EntryContext,
  ): Promise<EntryResolution | null>
}
