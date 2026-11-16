import type {
  BridgeEvent,
  LiveBrowserApi,
  ViewOptions,
} from '../../live-browser/protocol.js'
import {
  type BrowserState,
  createInitialState,
  reduceBrowserState,
} from './state.js'

export class BrowserController {
  private currentState: BrowserState = createInitialState()
  private generation = 0
  private currentId: string | null = null
  private disposed = false
  private unsubscribe: (() => void) | null
  private pullKey: string | null = null
  private begunAt = 0

  get startedAt(): number {
    return this.begunAt
  }

  constructor(
    private readonly api: LiveBrowserApi,
    private readonly onState: (state: BrowserState) => void,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.unsubscribe = api.onEvent((event) => this.handleEvent(event))
  }

  get state(): BrowserState {
    return this.currentState
  }

  navigate(path: string, options: ViewOptions): void {
    if (this.disposed) {
      return
    }

    const oldId = this.currentId
    const generation = ++this.generation
    this.begunAt = this.now()
    this.currentId = null
    this.pullKey = null
    this.dispatch({ type: 'begin', generation, path, options })

    if (oldId !== null) {
      void this.api.cancel(oldId).catch(() => undefined)
    }

    void this.api.start({ generation, path, options: { ...options } }).then(
      ({ id }) => {
        if (this.disposed || generation !== this.generation) {
          void this.api.cancel(id).catch(() => undefined)
          return
        }

        this.currentId = id
        this.dispatch({ type: 'attachId', generation, id })

        if (this.currentState.phase === 'error') {
          this.cancelCurrent(id)
        }
      },
      (error: unknown) => {
        if (this.disposed || generation !== this.generation) {
          return
        }

        this.currentId = null
        this.dispatch({
          type: 'event',
          generation,
          event: {
            v: 1,
            type: 'error',
            id: this.currentState.requestId ?? '',
            code: 'IO_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        })
      },
    )
  }

  pullNext(): void {
    const id = this.currentId
    const { generation, entries, phase, total } = this.currentState

    if (
      this.disposed ||
      id === null ||
      phase !== 'receiving' ||
      total === null ||
      entries.length >= total
    ) {
      return
    }

    const key = `${generation}:${entries.length}`
    if (this.pullKey === key) {
      return
    }

    this.pullKey = key
    void this.api.next(id).catch((error: unknown) => {
      if (this.disposed || generation !== this.generation) {
        return
      }

      this.currentId = null
      this.dispatch({
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
    if (!this.disposed) {
      this.dispatch({ type: 'select', index })
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.generation += 1
    const id = this.currentId
    this.currentId = null
    this.unsubscribe?.()
    this.unsubscribe = null

    if (id !== null) {
      void this.api.cancel(id).catch(() => undefined)
    }
  }

  private handleEvent(event: BridgeEvent): void {
    if (this.disposed || event.generation !== this.generation) {
      return
    }

    this.dispatch({
      type: 'event',
      generation: event.generation,
      event,
    })

    if (this.currentState.phase === 'error') {
      const id = this.currentId ?? this.currentState.requestId
      this.currentId = null
      if (id !== null) {
        this.cancelCurrent(id)
      }
    }
  }

  private dispatch(action: Parameters<typeof reduceBrowserState>[1]): void {
    const next = reduceBrowserState(this.currentState, action)
    if (next === this.currentState) {
      return
    }

    this.currentState = next
    this.onState(next)
  }

  private cancelCurrent(id: string): void {
    if (this.currentId === id) {
      this.currentId = null
    }

    void this.api.cancel(id).catch(() => undefined)
  }
}
