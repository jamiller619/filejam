import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { type HTMLAttributes, type RefObject, useEffect, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import Toolbar from './Toolbar.js'

const styles = css`
  .titlebar {
    app-region: drag;
    user-select: none;
    position: relative;
    box-sizing: border-box;
    padding-block-start: var(--suzy-space-3);
  }

  .safeArea {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding-left: calc(
      var(--suzy-space-2) + var(--titlebar-safe-left, 0px)
    );
    padding-right: calc(
      var(--suzy-space-2) + var(--titlebar-safe-right, 0px)
    );
  }
`

type WindowControlsOverlay = EventTarget & {
  getTitlebarAreaRect: () => DOMRect
  visible: boolean
}

export default function Titlebar(props: HTMLAttributes<HTMLDivElement>) {
  const titlebar = useRef<HTMLElement>(null)

  useSyncColorTheme(titlebar)
  useSyncSafeArea(titlebar)

  return (
    <header
      {...props}
      ref={titlebar}
      className={clsx(styles.titlebar, props.className)}
    >
      <div className={styles.safeArea}>
        <Toolbar />
      </div>
    </header>
  )
}

function useSyncSafeArea(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current
    const windowControlsOverlay = (
      navigator as Navigator & {
        windowControlsOverlay?: WindowControlsOverlay
      }
    ).windowControlsOverlay

    if (!element || !windowControlsOverlay) {
      return
    }

    const syncSafeArea = () => {
      if (!windowControlsOverlay.visible) {
        element.style.setProperty('--titlebar-safe-left', '0px')
        element.style.setProperty('--titlebar-safe-right', '0px')

        return
      }

      const titlebarRect = element.getBoundingClientRect()
      const safeRect = windowControlsOverlay.getTitlebarAreaRect()
      const safeLeft = Math.max(titlebarRect.left, safeRect.left)
      const safeRight = Math.min(titlebarRect.right, safeRect.right)

      const leftInset = Math.max(0, safeLeft - titlebarRect.left)
      const rightInset = Math.max(0, titlebarRect.right - safeRight)

      element.style.setProperty('--titlebar-safe-left', `${leftInset}px`)
      element.style.setProperty('--titlebar-safe-right', `${rightInset}px`)
    }

    const resizeObserver = new ResizeObserver(syncSafeArea)

    resizeObserver.observe(element)
    windowControlsOverlay.addEventListener('geometrychange', syncSafeArea)
    window.addEventListener('resize', syncSafeArea)
    syncSafeArea()

    return () => {
      resizeObserver.disconnect()
      windowControlsOverlay.removeEventListener('geometrychange', syncSafeArea)
      window.removeEventListener('resize', syncSafeArea)
    }
  }, [ref])
}

function useSyncColorTheme(ref: RefObject<HTMLElement | null>) {
  const api = useApi()

  useEffect(() => {
    const element = ref.current

    if (!element || !api) {
      return
    }

    // Canvas resolves CSS colors (including modern color spaces) to sRGB hex.
    const context = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true })

    if (!context) {
      return
    }

    const syncColor = () => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = getComputedStyle(element).color
      context.fillRect(0, 0, 1, 1)

      const channels = context.getImageData(0, 0, 1, 1).data.slice(0, 3)
      const color = `#${Array.from(channels, (channel) => channel.toString(16).padStart(2, '0')).join('')}`

      void api.setControlsColor(color).catch(console.error)
    }

    const observer = new MutationObserver(syncColor)

    for (
      let ancestor: HTMLElement | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-suzy-theme'],
      })
    }

    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')

    colorScheme.addEventListener('change', syncColor)

    syncColor()

    return () => {
      observer.disconnect()
      colorScheme.removeEventListener('change', syncColor)
    }
  }, [api, ref])
}
