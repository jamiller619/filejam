import clsx from 'clsx'
import { css } from 'inline-css-modules'
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useEffect,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'

const styles = css`
  /* --padding: var(--suzy-space-5); */

  .dialog {
    width: min(420px, calc(100vw - 2 * var(--padding)));
    max-height: calc(100vh - 2 * var(--padding));
    box-sizing: border-box;
    /* background: var(--suzy-gray-2); */
  }

  .dialog::backdrop {
    background: #0004;
  }

  .dialog h2 {
    font-size: 16px;
    margin: 0 0 4px;
  }

  .dialog p {
    margin: 0 0 16px;
    color: var(--suzy-gray-11);
    overflow-wrap: anywhere;
  }

  .dialog button,
  .dialog input,
  .dialog select {
    font: inherit;
    color: inherit;
  }

  .dialog button {
    cursor: pointer;
  }
`

export type DialogProps = Omit<
  ComponentPropsWithoutRef<'dialog'>,
  'children' | 'open'
> & {
  children: ReactNode
}

export default function Dialog({ children, className, ...props }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const modal = dialog.current

    modal?.showModal()

    return () => {
      modal?.close()

      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus()
      }
    }
  }, [])

  return createPortal(
    <dialog ref={dialog} className={clsx(styles.dialog, className)} {...props}>
      {children}
    </dialog>,
    document.body,
  )
}
