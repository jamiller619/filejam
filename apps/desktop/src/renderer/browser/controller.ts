import type {
  BridgeEvent,
  BrowserApi,
  ViewOptions,
} from '../../browser/protocol.js'
import {
  type BrowserState,
  createInitialState,
  reduceBrowserState,
} from './state.js'

export class BrowserController {
  #currentState: BrowserState = createInitialState()
  #generation = 0
  #currentId: string | null = null
  #disposed = false
  #unsubscribe: (() => void) | null
  #pullKey: string | null = null
  #begunAt = 0

  get startedAt(): number {
    return this.#begunAt
  }

  readonly #api: BrowserApi
  readonly #onState: (state: BrowserState) => void
  readonly #now: () => number

  constructor(
    api: BrowserApi,
    onState: (state: BrowserState) => void,
    now: () => number = () => performance.now(),
  ) {
    this.#api = api
    this.#onState = onState
    this.#now = now

    this.#unsubscribe = api.onEvent((event) => this.#handleEvent(event))
  }

  get state(): BrowserState {
    return this.#currentState
  }

  navigate(path: string, options: ViewOptions): void {
    if (this.#disposed) {
      return
    }

    const oldId = this.#currentId
    const generation = ++this.#generation
    this.#begunAt = this.#now()
    this.#currentId = null
    this.#pullKey = null
    this.#dispatch({ type: 'begin', generation, path, options })

    if (oldId !== null) {
      void this.#api.cancel(oldId).catch(() => undefined)
    }

    void this.#api.start({ generation, path, options: { ...options } }).then(
      ({ id }) => {
        if (this.#disposed || generation !== this.#generation) {
          void this.#api.cancel(id).catch(() => undefined)
          return
        }

        this.#currentId = id
        this.#dispatch({ type: 'attachId', generation, id })

        if (this.#currentState.phase === 'error') {
          this.#cancelCurrent(id)
        }
      },
      (error: unknown) => {
        if (this.#disposed || generation !== this.#generation) {
          return
        }

        this.#currentId = null
        this.#dispatch({
          type: 'event',
          generation,
          event: {
            v: 1,
            type: 'error',
            id: this.#currentState.requestId ?? '',
            code: 'IO_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        })
      },
    )
  }

  pullNext(): void {
    const id = this.#currentId
    const { generation, entries, phase, total } = this.#currentState

    if (
      this.#disposed ||
      id === null ||
      phase !== 'receiving' ||
      total === null ||
      entries.length >= total
    ) {
      return
    }

    const key = `${generation}:${entries.length}`
    if (this.#pullKey === key) {
      return
    }

    this.#pullKey = key
    void this.#api.next(id).catch((error: unknown) => {
      if (this.#disposed || generation !== this.#generation) {
        return
      }

      this.#currentId = null
      this.#dispatch({
        type: 'event',
        generation,
        event: {
          v: 1,
          type: 'error',
          id,
          code: 'IO_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
      })
    })
  }

  select(index: number | null): void {
    if (!this.#disposed) {
      this.#dispatch({ type: 'select', index })
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return
    }

    this.#disposed = true
    this.#generation += 1
    const id = this.#currentId
    this.#currentId = null
    this.#unsubscribe?.()
    this.#unsubscribe = null

    if (id !== null) {
      void this.#api.cancel(id).catch(() => undefined)
    }
  }

  #handleEvent(event: BridgeEvent): void {
    if (this.#disposed || event.generation !== this.#generation) {
      return
    }

    this.#dispatch({
      type: 'event',
      generation: event.generation,
      event,
    })

    if (this.#currentState.phase === 'error') {
      const id = this.#currentId ?? this.#currentState.requestId
      this.#currentId = null
      if (id !== null) {
        this.#cancelCurrent(id)
      }
    }
  }

  #dispatch(action: Parameters<typeof reduceBrowserState>[1]): void {
    const next = reduceBrowserState(this.#currentState, action)
    if (next === this.#currentState) {
      return
    }

    this.#currentState = next
    this.#onState(next)
  }

  #cancelCurrent(id: string): void {
    if (this.#currentId === id) {
      this.#currentId = null
    }

    void this.#api.cancel(id).catch(() => undefined)
  }
}
