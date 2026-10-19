import type { Config } from '@files/server'
import type { BrowserWindow, Rectangle } from 'electron'

export type WindowState = {
  bounds: Rectangle
  maximized: boolean
  fullscreen: boolean
}

export function readWindowState(
  stored: Config['window.main'],
  fallback: Rectangle,
  workAreas: Rectangle[],
): WindowState {
  const hasBounds = [stored.x, stored.y, stored.width, stored.height].every(
    Number.isSafeInteger,
  )
  const state: WindowState = {
    bounds: hasBounds
      ? {
          x: stored.x as number,
          y: stored.y as number,
          width: stored.width as number,
          height: stored.height as number,
        }
      : fallback,
    maximized: stored.maximized === true,
    fullscreen: stored.fullscreen === true,
  }

  const bounds = state.bounds
  const overlap = (area: Rectangle) =>
    Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) -
        Math.max(bounds.x, area.x),
    ) *
    Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) -
        Math.max(bounds.y, area.y),
    )
  const area = [...workAreas].sort((a, b) => overlap(b) - overlap(a))[0]

  if (area) {
    const width = Math.min(bounds.width, area.width)
    const height = Math.min(bounds.height, area.height)

    state.bounds = {
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
      width,
      height,
    }
  }

  return state
}

export function trackWindowState(
  window: BrowserWindow,
  initial: WindowState,
  saveState: (state: Config['window.main']) => Promise<void>,
) {
  let state = initial
  let timer: ReturnType<typeof setTimeout> | undefined
  let pendingSave = Promise.resolve()

  const save = () => {
    clearTimeout(timer)
    timer = undefined
    const { bounds, ...modes } = state

    pendingSave = saveState({ ...bounds, ...modes }).catch((error) => {
      console.warn('Could not save window state', error)
    })
  }

  const capture = () => {
    // Minimizing can obscure the previous maximized state on some platforms.
    if (!window.isMinimized()) {
      const fullscreen = window.isFullScreen()

      state = {
        bounds: window.getNormalBounds(),
        maximized: fullscreen ? state.maximized : window.isMaximized(),
        fullscreen,
      }
    }

    clearTimeout(timer)
    timer = setTimeout(save, 250)
  }

  // Apply modes after the normal bounds have been passed to BrowserWindow.
  if (initial.maximized) {
    window.maximize()
  }

  if (initial.fullscreen) {
    window.setFullScreen(true)
  }

  window.on('move', capture)
  window.on('resize', capture)
  window.on('maximize', capture)
  window.on('unmaximize', capture)
  window.on('enter-full-screen', capture)
  window.on('leave-full-screen', capture)
  window.on('restore', capture)

  window.on('close', () => {
    capture()
    save()
  })

  return async () => {
    if (!window.isDestroyed()) {
      capture()
    }

    save()
    await pendingSave
  }
}
