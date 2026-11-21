import { Button, Icon, ScrollArea } from '@filejam/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'

const styles = css`
  .panel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
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
  showCloseButton?: boolean | undefined
  onClose?: (() => void) | undefined
}

export default function DetailsPane({
  ariaLabel,
  children,
  title,
  bodyClassName,
  closing = false,
  footer,
  showCloseButton = true,
  onClose,
}: DetailsPaneProps) {
  const closeCallback = useRef(onClose)
  const closable = onClose !== undefined

  useLayoutEffect(() => {
    closeCallback.current = onClose
  }, [onClose])

  useEffect(() => {
    if (closing || !closable) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog:modal')
      ) {
        event.preventDefault()
        closeCallback.current?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closing, closable])

  return (
    <aside
      className={styles.panel}
      data-details-pane
      data-closing={closing}
      inert={closing}
      aria-label={ariaLabel}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {closable && showCloseButton && (
          <Button
            onClick={() => closeCallback.current?.()}
            aria-label="Hide details"
          >
            <Icon name="hideDetails" size={16} />
          </Button>
        )}
      </header>
      <div className={styles.content}>
        <ScrollArea>
          <div
            className={clsx(
              bodyClassName ? [styles.body, bodyClassName] : styles.body,
            )}
          >
            {children}
          </div>
        </ScrollArea>
      </div>
      {footer}
    </aside>
  )
}
