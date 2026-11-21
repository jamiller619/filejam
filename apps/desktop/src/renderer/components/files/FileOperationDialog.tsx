import { css } from 'inline-css-modules'
import { useEffect, useRef, useState } from 'react'
import type { OperationRequest } from '../../../operations/types.js'

export type TransferRequest = OperationRequest & {
  kind: 'copy' | 'move'
  destination: string
}

const styles = css`
  .dialog {
    width: min(28rem, calc(100vw - 3rem));
    padding: var(--suzy-space-5);
    border: 1px solid var(--suzy-gray-6);
    border-radius: var(--suzy-radius-3);
    background: var(--suzy-gray-2);
    color: var(--suzy-gray-12);

    &::backdrop { background: #0008; }
    form { display: grid; gap: var(--suzy-space-4); }
    label { display: grid; gap: var(--suzy-space-2); }
    input, select { padding: var(--suzy-space-2); }
    h2, p { margin: 0; }
  }
`

export default function FileOperationDialog({
  request,
  onClose,
  onError,
}: {
  request: TransferRequest
  onClose: () => void
  onError: (message: string) => void
}) {
  const [conflict, setConflict] =
    useState<NonNullable<OperationRequest['conflict']>>('error')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()

    return () => element?.close()
  }, [])

  async function submit() {
    setPending(true)

    try {
      await window.filejam.operations.start({
        ...request,
        conflict,
      })
      onClose()
    } catch (error) {
      setError(String(error))
      onError(String(error))
      setPending(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={`${request.kind} selected items`}
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) {
          onClose()
        }
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h2>
          {request.kind} {request.paths.length} selected items
        </h2>
        <label>
          If a destination exists{' '}
          <select
            value={conflict}
            onChange={(event) =>
              setConflict(event.target.value as typeof conflict)
            }
          >
            <option value="error">Stop and show an error</option>
            <option value="skip">Skip existing items</option>
            <option value="keepBoth">Keep both with unique names</option>
            <option value="replace">
              Replace and retain original for undo
            </option>
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? 'Starting…' : 'Continue'}
        </button>
        <button type="button" disabled={pending} onClick={onClose}>
          Cancel
        </button>
      </form>
    </dialog>
  )
}
