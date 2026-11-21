import { Button, Dialog } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileEntry } from './Files.types.js'

const styles = css`
  .editor {
    position: fixed;
    z-index: var(--suzy-z-dropdown);
    margin: 0;
  }
  .input {
    width: 100%;
    min-height: 26px;
    box-sizing: border-box;
    border: 1px solid var(--suzy-accent-9);
    border-radius: var(--suzy-radius-2);
    padding: 2px 4px;
    background: var(--suzy-gray-2);
    color: var(--suzy-gray-12);
    font: inherit;
    text-align: left;
    outline: none;
  }
  .error {
    margin: 4px 0 0;
    padding: 6px;
    background: var(--suzy-gray-2);
    color: var(--suzy-danger-11);
  }
  .conflict {
    padding: var(--suzy-space-5);
    border: 1px solid var(--suzy-gray-6);
    border-radius: var(--suzy-radius-3);
    background: var(--suzy-gray-2);
    color: var(--suzy-gray-12);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--suzy-space-2);
    margin-top: var(--suzy-space-4);
  }
  .hint {
    margin: 0;
    padding: 4px;
    font-size: 12px;
    background: var(--suzy-gray-2);
  }
`

export default function InlineRename({
  entry,
  paths,
  container,
  onClose,
  onRenamed,
}: {
  entry: FileEntry & { absolutePath: string }
  paths: string[]
  container: HTMLElement | null
  onClose: () => void
  onRenamed: () => void
}) {
  const initialName = paths.length > 1 ? '{name} ({n}){ext}' : entry.name
  const [name, setName] = useState(initialName)
  const [position, setPosition] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)
  const [conflict, setConflict] = useState<{
    name: string
    suggestion: string
  } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const positioned = position !== null

  function cancel() {
    busy.current = true
    onClose()
  }

  useLayoutEffect(() => {
    const selector = `[data-file-path="${CSS.escape(entry.absolutePath)}"]`
    const labelSelector = '[data-grid-file-label], [data-file-name]'
    const row = container?.querySelector<HTMLElement>(selector)
    const label = row?.querySelector<HTMLElement>(labelSelector)
    const anchor = label ?? row
    returnFocus.current = row?.querySelector<HTMLElement>('button, a') ?? null

    if (!anchor) {
      onClose()

      return
    }

    let observed = anchor
    const update = () => {
      const currentRow = container?.querySelector<HTMLElement>(selector)
      const currentLabel = currentRow?.querySelector<HTMLElement>(labelSelector)
      const currentAnchor = currentLabel ?? currentRow

      if (!currentAnchor) {
        if (!busy.current) {
          onClose()
        }

        return
      }

      if (currentAnchor !== observed) {
        observer.unobserve(observed)
        observed = currentAnchor
        observer.observe(observed)
      }

      returnFocus.current =
        currentRow?.querySelector<HTMLElement>('button, a') ?? null
      const bounds = currentAnchor.getBoundingClientRect()
      const gridLabel = currentLabel?.hasAttribute('data-grid-file-label')
      const width = gridLabel
        ? bounds.width
        : Math.min(Math.max(bounds.width, 180), window.innerWidth - 16)

      setPosition({
        left: gridLabel
          ? bounds.left
          : Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
        top: currentLabel ? bounds.top - 3 : bounds.bottom - 28,
        width,
      })
    }
    const observer = new ResizeObserver(update)
    observer.observe(anchor)
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [container, entry.absolutePath, onClose])

  useEffect(
    () => () => {
      if (
        document.activeElement === document.body &&
        returnFocus.current?.isConnected
      ) {
        returnFocus.current.focus({ preventScroll: true })
      }
    },
    [],
  )

  useEffect(() => {
    if (positioned) {
      const frame = requestAnimationFrame(() => {
        input.current?.focus()
        const dot = initialName.lastIndexOf('.')
        input.current?.setSelectionRange(
          0,
          paths.length === 1 && entry.kind !== 'directory' && dot > 0
            ? dot
            : initialName.length,
        )
      })

      return () => cancelAnimationFrame(frame)
    }
  }, [positioned, initialName, entry.kind, paths.length])

  async function submit() {
    if (busy.current) {
      return
    }

    if (paths.length === 1 && name === entry.name) {
      onClose()

      return
    }

    busy.current = true
    setPending(true)
    setError('')

    try {
      const result = await window.filejam.operations.rename(paths, name)

      if (result.status === 'conflict') {
        setConflict(result)
        setName(result.suggestion)
      } else {
        onRenamed()
      }
    } catch (error) {
      setError(String(error))
      requestAnimationFrame(() => input.current?.focus())
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  if (conflict) {
    return (
      <Dialog
        className={styles.conflict}
        aria-label="Name already exists"
        onCancel={(event) => {
          event.preventDefault()
          if (!busy.current) {
            cancel()
          }
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <h2>Name already exists</h2>
          <p>
            A file or folder already exists with the name “{conflict.name}”.
            Rename it to “{conflict.suggestion}” instead?
          </p>
          <label>
            New name{' '}
            <input
              className={styles.input}
              autoFocus
              required
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className={styles.actions}>
            <Button type="button" disabled={pending} onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              Rename
            </Button>
          </div>
        </form>
      </Dialog>
    )
  }

  return (
    position &&
    createPortal(
      <form
        className={styles.editor}
        style={position}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          ref={input}
          className={styles.input}
          aria-label={
            paths.length > 1
              ? `Rename ${paths.length} items`
              : `Rename ${entry.name}`
          }
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (!busy.current) {
              void submit()
            }
          }}
          onKeyDown={(event) => {
            event.stopPropagation()

            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            } else if (
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {paths.length > 1 && (
          <p className={styles.hint}>
            Rename {paths.length} items using {'{name}'}, {'{ext}'}, and {'{n}'}
            .
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>,
      document.body,
    )
  )
}
