import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { readWindowState, trackWindowState } from '../dist/window-state.js'

const primaryArea = { x: 0, y: 0, width: 1920, height: 1080 }
const defaultBounds = { x: 410, y: 160, width: 1100, height: 760 }

test('restores window state and keeps windows visible after display changes', () => {
  const leftArea = { x: -1920, y: 0, width: 1920, height: 1080 }
  const saved = {
    x: -1800,
    y: 120,
    width: 1100,
    height: 760,
    maximized: true,
    fullscreen: false,
  }

  assert.deepEqual(
    readWindowState(saved, defaultBounds, [primaryArea, leftArea]),
    {
      bounds: { x: -1800, y: 120, width: 1100, height: 760 },
      maximized: true,
      fullscreen: false,
    },
  )
  assert.deepEqual(
    readWindowState(saved, defaultBounds, [primaryArea]).bounds,
    {
      x: 0,
      y: 120,
      width: 1100,
      height: 760,
    },
  )
})

test('tracks normal bounds and preserves maximized state while minimized', async () => {
  const window = new EventEmitter()
  const saved = []
  let maximized = false
  let minimized = false

  Object.assign(window, {
    maximize: () => {
      maximized = true
    },
    setFullScreen: () => {},
    isDestroyed: () => false,
    isMinimized: () => minimized,
    isFullScreen: () => false,
    isMaximized: () => maximized,
    getNormalBounds: () => defaultBounds,
  })

  const flush = trackWindowState(
    window,
    { bounds: defaultBounds, maximized: true, fullscreen: false },
    async (state) => saved.push(state),
  )

  minimized = true
  maximized = false
  await flush()

  assert.deepEqual(saved.at(-1), {
    ...defaultBounds,
    maximized: true,
    fullscreen: false,
  })
})
