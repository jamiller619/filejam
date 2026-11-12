import { Popover } from '@base-ui/react/popover'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import {
  Children,
  isValidElement,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import Button from './Button.js'
import Icon from './Icon/index.js'

const styles = css`
  .toolbar { display: flex; min-width: 0; align-items: center; }
  .item { display: flex; flex: 0 0 auto; width: max-content; }
  .toolbar > .item[data-trailing-start='true'] { margin-inline-start: auto; }
  .anchor { display: inline-flex; flex: 0 0 auto; }
  .anchor[data-trailing-start='true'] { margin-inline-start: auto; }
  .anchor[data-hidden='true'] { position: absolute; visibility: hidden; pointer-events: none; }
  .positioner { z-index: var(--suzy-z-dropdown); }
  .popup {
    display: flex;
    flex-direction: column;
    gap: var(--suzy-space-3);
    padding: var(--suzy-space-3);
    max-width: var(--available-width);
    max-height: var(--available-height);
    overflow: auto;
    border-radius: var(--suzy-radius-3);
    background: var(--suzy-gray-5);
    color: var(--suzy-text);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  }
`

/** Move portal hosts, preserving each control's state and a single mounted instance. */
export default function OverflowToolbar({
  children,
  className,
  trailingFrom,
}: {
  children: ReactNode
  className?: string | undefined
  /** Index of the first control in the right-aligned group. */
  trailingFrom?: number | undefined
}) {
  const toolbarRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const hosts = useRef(new Map<string, HTMLDivElement>())
  const widths = useRef(new Map<string, number>())
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [open, setOpen] = useState(false)
  const items = useMemo(
    () =>
      Children.toArray(children).map((content, index) => {
        const key = String(isValidElement(content) ? content.key : index)
        let host = hosts.current.get(key)

        if (!host) {
          host = document.createElement('div')
          host.className = styles.item ?? ''
          hosts.current.set(key, host)
        }

        return { key, host, content }
      }),
    [children],
  )

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    const anchor = anchorRef.current

    if (!toolbar || !anchor) {
      return
    }

    const keys = new Set(items.map((item) => item.key))

    for (const [key, host] of hosts.current) {
      if (!keys.has(key)) {
        host.remove()
        hosts.current.delete(key)
        widths.current.delete(key)
      }
    }

    for (const { host } of items) {
      if (!host.isConnected) {
        toolbar.insertBefore(host, anchor)
      }
    }

    const update = () => {
      const style = getComputedStyle(toolbar)
      const gap = Number.parseFloat(style.columnGap) || 0
      const available =
        toolbar.clientWidth -
        (Number.parseFloat(style.paddingInlineStart) || 0) -
        (Number.parseFloat(style.paddingInlineEnd) || 0)

      for (const { key, host } of items) {
        if (host.offsetWidth > 0) {
          widths.current.set(key, host.offsetWidth)
        }
      }

      const total =
        items.reduce(
          (sum, item) => sum + (widths.current.get(item.key) ?? 0),
          0,
        ) +
        gap * Math.max(0, items.length - 1)
      let visibleCount = items.length

      if (total > available && popup) {
        let used = anchor.offsetWidth
        visibleCount = 0

        for (const item of items) {
          used += (widths.current.get(item.key) ?? 0) + gap

          if (used > available) {
            break
          }

          visibleCount++
        }
      }

      let nextInline: Node | null = anchor
      let nextOverflow: Node | null = null

      for (let index = items.length - 1; index >= 0; index--) {
        const item = items[index]

        if (!item) {
          continue
        }

        const inline = index < visibleCount
        const target = inline ? toolbar : popup
        const next = inline ? nextInline : nextOverflow

        if (
          target &&
          (item.host.parentElement !== target || item.host.nextSibling !== next)
        ) {
          target.insertBefore(item.host, next)
        }

        if (inline) {
          nextInline = item.host
        } else {
          nextOverflow = item.host
        }
      }

      const hasOverflow = visibleCount < items.length
      const trailingIndex = trailingFrom ?? items.length

      items.forEach(({ host }, index) => {
        host.dataset.trailingStart = String(
          index === trailingIndex && index < visibleCount,
        )
      })
      anchor.dataset.trailingStart = String(trailingIndex >= visibleCount)
      setOverflowing(hasOverflow)

      if (!hasOverflow) {
        setOpen(false)
      }
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(toolbar)
    observer.observe(anchor)

    for (const { host } of items) {
      observer.observe(host)
    }

    return () => observer.disconnect()
  }, [items, popup, trailingFrom])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div
        ref={toolbarRef}
        className={clsx(styles.toolbar, className)}
        role="toolbar"
      >
        {items.map(({ key, host, content }) =>
          createPortal(content, host, key),
        )}
        <span
          ref={anchorRef}
          className={styles.anchor}
          data-hidden={!overflowing}
        >
          <Popover.Trigger
            render={<Button variant="ghost" />}
            aria-label="More options"
            title="More options"
          >
            <Icon name="more" size={20} />
          </Popover.Trigger>
        </span>
      </div>
      <Popover.Portal keepMounted>
        <Popover.Positioner
          className={styles.positioner}
          anchor={anchorRef}
          side="bottom"
          align="end"
          sideOffset={2}
        >
          <Popover.Popup
            ref={setPopup}
            className={styles.popup}
            aria-label="More options"
          />
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
