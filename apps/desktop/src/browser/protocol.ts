export type ViewOptions = {
  nameContains: string
  kind: 'all' | 'file' | 'directory'
  sortDirection: 'asc' | 'desc'
}

export type Entry = {
  hidden?: boolean
  system?: boolean
  path: string
  name: string
  kind: 'file' | 'directory' | 'symlink' | 'other'
}

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'NOT_DIRECTORY'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_PATH'
  | 'IO_ERROR'
  | 'LIMIT_EXCEEDED'

export type ServiceEvent =
  | { v: 1; type: 'ready' }
  | {
      v: 1
      type: 'listing'
      id: string
      path: string
      parentPath: string | null
      total: number
      metrics: { enumerationMs: number; filterSortMs: number }
    }
  | { v: 1; type: 'batch'; id: string; offset: number; entries: Entry[] }
  | { v: 1; type: 'done'; id: string; total: number }
  | { v: 1; type: 'cancelled'; id: string }
  | { v: 1; type: 'error'; id: string; code: ErrorCode; message: string }

export type ClientEvent =
  | Exclude<ServiceEvent, { type: 'ready' }>
  | {
      v: 1
      type: 'error'
      id: string
      code: 'SERVICE_UNAVAILABLE'
      message: string
    }

export type BridgeEvent = ClientEvent & { generation: number }

export type Command =
  | { v: 1; type: 'list'; id: string; path: string; options: ViewOptions }
  | { v: 1; type: 'next'; id: string }
  | { v: 1; type: 'cancel'; id: string }
  | { v: 1; type: 'shutdown' }

export type StartInput = {
  generation: number
  path: string
  options: ViewOptions
}

export type BrowserApi = {
  readonly mode: 'browser-poc'
  chooseFolder(): Promise<string | null>
  start(input: StartInput): Promise<{ id: string }>
  next(id: string): Promise<void>
  cancel(id: string): Promise<void>
  onEvent(listener: (event: BridgeEvent) => void): () => void
}

declare global {
  interface Window {
    locations?: {
      get(): Promise<import('./locations.js').Locations>
      favorite(
        path: string,
        enabled: boolean,
      ): Promise<import('./locations.js').Locations>
    }
    browser?: BrowserApi
  }
}
