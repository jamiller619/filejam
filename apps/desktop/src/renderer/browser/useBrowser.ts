import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserApi, ViewOptions } from '../../browser/protocol.js'
import { BrowserController } from './controller.js'
import { type BrowserState, createInitialState } from './state.js'

export function useBrowser(api: BrowserApi) {
  const [state, setState] = useState<BrowserState>(createInitialState)
  const [controller, setController] = useState<BrowserController | null>(null)
  const timingNode = useRef<HTMLOutputElement>(null)
  const timing = useRef({
    generation: 0,
    firstRowsMs: null as number | null,
    completeMs: null as number | null,
    firstFrameOpportunityMs: null as number | null,
    maxFrameGapMs: 0,
  })

  useLayoutEffect(() => {
    if (!controller || state.generation === 0) {
      return
    }

    if (timing.current.generation !== state.generation) {
      timing.current = {
        generation: state.generation,
        firstRowsMs: null,
        completeMs: null,
        firstFrameOpportunityMs: null,
        maxFrameGapMs: 0,
      }
    }

    const elapsed = performance.now() - controller.startedAt
    if (state.entries.length > 0 && timing.current.firstRowsMs === null) {
      timing.current.firstRowsMs = elapsed
    }
    if (state.phase === 'complete' && timing.current.completeMs === null) {
      timing.current.completeMs = elapsed
    }
    if (timingNode.current) {
      timingNode.current.textContent = JSON.stringify(timing.current)
    }
  }, [controller, state])

  useLayoutEffect(() => {
    if (!controller || state.generation === 0) {
      return
    }

    let previous = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const current = timing.current
      current.maxFrameGapMs = Math.max(current.maxFrameGapMs, now - previous)
      previous = now
      if (
        current.firstRowsMs !== null &&
        current.firstFrameOpportunityMs === null
      ) {
        current.firstFrameOpportunityMs = now - controller.startedAt
      }
      if (timingNode.current) {
        timingNode.current.textContent = JSON.stringify(current)
      }
      if (
        controller.state.phase === 'loading' ||
        controller.state.phase === 'receiving'
      ) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [controller, state.generation])

  useEffect(() => {
    const activeController = new BrowserController(api, setState)
    setController(activeController)

    return () => {
      activeController.dispose()
      setController((currentController) =>
        currentController === activeController ? null : currentController,
      )
    }
  }, [api])

  useEffect(() => {
    if (
      state.phase !== 'receiving' ||
      state.total === null ||
      state.entries.length >= state.total
    ) {
      return
    }

    const generation = state.generation
    const receivedCount = state.entries.length
    const timer = window.setTimeout(() => {
      setController((currentController) => {
        if (currentController === null) {
          return currentController
        }

        const currentState = currentController.state
        if (
          currentState.generation !== generation ||
          currentState.phase !== 'receiving' ||
          currentState.entries.length !== receivedCount
        ) {
          return currentController
        }

        currentController.pullNext()
        return currentController
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [state])

  const navigate = (path: string, options: ViewOptions) =>
    controller?.navigate(path, options)
  const select = (index: number | null) => controller?.select(index)

  return { state, navigate, select, timingNode }
}
