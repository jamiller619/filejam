import { Button, Icon, ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'

const styles = css`
  .panel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: var(--details-width);
    height: 100%;
    min-width: 0;
    flex-shrink: 0;
    overflow: hidden;
    color: var(--suzy-gray-12);
    background: var(--suzy-gray-4);
    pointer-events: auto;

    &[data-closing='true'] {
      pointer-events: none;
    }
  }

  .header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: var(--suzy-space-3);
    padding: var(--suzy-space-3);
  }

  .title {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: var(--suzy-font-size-3);
    font-weight: 500;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .body {
    box-sizing: border-box;
    min-width: 0;
    min-height: 100%;
    padding: 0 var(--suzy-space-3) var(--suzy-space-3);
  }
`

type DetailsPaneProps = {
  ariaLabel: string
  children: ReactNode
  title: ReactNode
  bodyClassName?: string | undefined
  closing?: boolean | undefined
  footer?: ReactNode | undefined
  onClose?: (() => void) | undefined
  onClosed?: (() => void) | undefined
}

export default function DetailsPane({
  ariaLabel,
  children,
  title,
  bodyClassName,
  closing = false,
  footer,
  onClose,
  onClosed,
}: DetailsPaneProps) {
  const panel = useRef<HTMLElement>(null)
  const closeCallback = useRef(onClose)
  const closedCallback = useRef(onClosed)
  const closable = onClose !== undefined

  useLayoutEffect(() => {
    closeCallback.current = onClose
    closedCallback.current = onClosed
  }, [onClose, onClosed])

  useLayoutEffect(() => {
    const element = panel.current
    const host = element?.parentElement

    if (!element || !host) {
      return
    }

    // Keep the full-size pane left-aligned inside its clipped host so one
    // moving boundary controls both the content width and pane position.
    const from = host.getBoundingClientRect().width
    const to = closing ? 0 : element.getBoundingClientRect().width

    host.style.width = `${to}px`

    if (!closing && Math.abs(from - to) < 1) {
      return
    }

    const duration = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? 0
      : 180
    const timing: KeyframeAnimationOptions = {
      duration,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    }
    const hostAnimation = host.animate(
      [{ width: `${from}px` }, { width: `${to}px` }],
      timing,
    )
    const panelAnimation = element.animate(
      closing
        ? [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }]
        : [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
      timing,
    )

    hostAnimation.onfinish = () => {
      if (closing) {
        closedCallback.current?.()
      }
    }

    return () => {
      host.style.width = `${host.getBoundingClientRect().width}px`

      hostAnimation.onfinish = null
      hostAnimation.cancel()
      panelAnimation.cancel()
    }
  }, [closing])

  useEffect(() => {
    if (closing || !closable) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCallback.current?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closing, closable])

  return (
    <aside
      ref={panel}
      className={styles.panel}
      data-details-pane
      data-closing={closing}
      inert={closing}
      aria-label={ariaLabel}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {closable && (
          <Button
            onClick={() => closeCallback.current?.()}
            aria-label="Hide details"
          >
            <Icon name="hide-details" size={16} />
          </Button>
        )}
      </header>
      <div className={styles.content}>
        <ScrollArea>
          <div
            className={
              bodyClassName ? `${styles.body} ${bodyClassName}` : styles.body
            }
          >
            {children}
          </div>
        </ScrollArea>
      </div>
      {footer}
    </aside>
  )
}
