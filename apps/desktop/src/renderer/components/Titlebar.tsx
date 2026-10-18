import clsx from 'clsx'
import { css } from 'inline-css-modules'
import { type HTMLAttributes, useEffect, useRef } from 'react'
import { useApi } from '../hooks/useApi.js'
import Toolbar from './Toolbar.js'

const styles = css`
  .titlebar {
    app-region: drag;
    user-select: none;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding-inline: var(--suzy-space-2);
  }
`

export default function Titlebar(props: HTMLAttributes<HTMLDivElement>) {
  const api = useApi()
  const titlebar = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = titlebar.current
    if (!element || !api) return

    // Canvas resolves CSS colors (including modern color spaces) to sRGB hex.
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return

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
  }, [api])

  return (
    <header
      {...props}
      ref={titlebar}
      className={clsx(styles.titlebar, props.className)}
    >
      <Toolbar />
    </header>
  )
}
