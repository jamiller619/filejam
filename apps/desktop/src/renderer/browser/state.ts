import type { ClientEvent, Entry, ViewOptions } from '../../browser/protocol.js'

export type BrowserState = {
  generation: number
  requestId: string | null
  phase: 'idle' | 'loading' | 'receiving' | 'complete' | 'error'
  requestedPath: string
  resolvedPath: string | null
  parentPath: string | null
  total: number | null
  entries: Entry[]
  error: string | null
  appliedOptions: ViewOptions
  selectedIndex: number | null
}

export type BrowserAction =
  | { type: 'begin'; generation: number; path: string; options: ViewOptions }
  | { type: 'attachId'; generation: number; id: string }
  | { type: 'event'; generation: number; event: ClientEvent }
  | { type: 'select'; index: number | null }

export function createInitialState(): BrowserState {
  return {
    generation: 0,
    requestId: null,
    phase: 'idle',
    requestedPath: '',
    resolvedPath: null,
    parentPath: null,
    total: null,
    entries: [],
    error: null,
    appliedOptions: { nameContains: '', kind: 'all', sortDirection: 'asc' },
    selectedIndex: null,
  }
}

export function reduceBrowserState(
  state: BrowserState,
  action: BrowserAction,
): BrowserState {
  if (action.type === 'begin') {
    if (action.generation <= state.generation) {
      return state
    }

    return {
      ...createInitialState(),
      generation: action.generation,
      phase: 'loading',
      requestedPath: action.path,
      appliedOptions: { ...action.options },
    }
  }

  if (action.type === 'attachId') {
    if (action.generation !== state.generation) {
      return state
    }

    if (state.requestId !== null && state.requestId !== action.id) {
      return {
        ...state,
        phase: 'error',
        entries: [],
        selectedIndex: null,
        error: 'Invalid listing response',
      }
    }

    return { ...state, requestId: action.id }
  }

  if (action.type === 'event') {
    if (action.generation !== state.generation) {
      return state
    }

    const { event } = action
    const boundState =
      state.requestId === null ? { ...state, requestId: event.id } : state

    if (boundState.requestId !== event.id) {
      return invalidListing(boundState)
    }

    if (event.type === 'listing') {
      if (boundState.phase !== 'loading') {
        return invalidListing(boundState)
      }

      return {
        ...boundState,
        phase: 'receiving',
        resolvedPath: event.path,
        parentPath: event.parentPath,
        total: event.total,
      }
    }

    if (event.type === 'batch') {
      if (
        boundState.phase !== 'receiving' ||
        event.offset !== boundState.entries.length ||
        event.entries.length === 0 ||
        event.entries.length + boundState.entries.length >
          (boundState.total ?? 0)
      ) {
        return invalidListing(boundState)
      }

      return {
        ...boundState,
        entries: [...boundState.entries, ...event.entries],
      }
    }

    if (event.type === 'done') {
      if (
        boundState.phase !== 'receiving' ||
        boundState.entries.length !== boundState.total ||
        event.total !== boundState.total
      ) {
        return invalidListing(boundState)
      }

      return { ...boundState, phase: 'complete' }
    }

    if (event.type === 'cancelled') {
      return {
        ...boundState,
        phase: 'idle',
        entries: [],
        selectedIndex: null,
      }
    }

    return {
      ...boundState,
      phase: 'error',
      entries: [],
      selectedIndex: null,
      error:
        event.code === 'SERVICE_UNAVAILABLE'
          ? `SERVICE_UNAVAILABLE: ${event.message}`
          : event.message,
    }
  }

  if (action.index === null) {
    return { ...state, selectedIndex: null }
  }

  if (action.index < 0 || action.index >= state.entries.length) {
    return state
  }

  return { ...state, selectedIndex: action.index }
}

function invalidListing(state: BrowserState): BrowserState {
  return {
    ...state,
    phase: 'error',
    entries: [],
    selectedIndex: null,
    error: 'Invalid listing response',
  }
}
