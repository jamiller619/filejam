import { useEffect, useState } from 'react'
import type { FileOperation, OperationItem } from '../../../operations/types.js'
import { queryClient } from '../../queryClient.js'

/** Shared service history is visible from either pane, including after restart. */
export default function FileOperations() {
  const [operations, setOperations] = useState<FileOperation[]>([])
  const [error, setError] = useState('')
  const [extraItems, setExtraItems] = useState<Record<string, OperationItem[]>>(
    {},
  )

  useEffect(() => {
    let stopped = false
    let previous = ''
    let previousResults = ''
    let timer: ReturnType<typeof setTimeout>

    async function update() {
      try {
        const history = await window.filejam.operations.list()

        if (stopped) {
          return
        }

        const signature = JSON.stringify(history)
        const results = JSON.stringify(
          history.map((operation) => [
            operation.id,
            operation.completedCount,
            operation.items.map((item) => item.status),
          ]),
        )

        if (signature !== previous) {
          setOperations(history)

          if (previousResults && results !== previousResults) {
            void queryClient.invalidateQueries({ queryKey: ['files'] })
            void queryClient.invalidateQueries({ queryKey: ['settings'] })
            window.dispatchEvent(new Event('filejam:operations-updated'))
          }

          previous = signature
          previousResults = results
        }
      } catch (error) {
        if (!stopped) {
          setError(String(error))
        }
      }

      if (!stopped) {
        timer = setTimeout(update, 1000)
      }
    }

    void update()

    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  async function historyAction(action: 'undo' | 'redo') {
    try {
      await window.filejam.operations[action]()
    } catch (error) {
      setError(String(error))
    }
  }

  async function moreItems(operation: FileOperation) {
    try {
      const offset =
        operation.items.length + (extraItems[operation.id]?.length ?? 0)
      const items = await window.filejam.operations.items(operation.id, offset)
      setExtraItems((current) => ({
        ...current,
        [operation.id]: [...(current[operation.id] ?? []), ...items],
      }))
    } catch (error) {
      setError(String(error))
    }
  }

  const active = operations.find((operation) =>
    ['queued', 'running'].includes(operation.status),
  )

  return (
    <section
      aria-label="File operations"
      data-operation-id={operations[0]?.id}
      data-operation-status={operations[0]?.status}
    >
      <button
        type="button"
        disabled={!!active || !operations[0]?.undoAvailable}
        onClick={() => void historyAction('undo')}
      >
        Undo file operation
      </button>
      <button
        type="button"
        disabled={!!active || !operations[0]?.redoAvailable}
        onClick={() => void historyAction('redo')}
      >
        Redo file operation
      </button>
      {error && <p role="alert">{error}</p>}
      {active && (
        <p role="status">
          {active.kind}:{' '}
          {active.completedCount ??
            active.items.filter((item) => item.status === 'completed')
              .length}{' '}
          of {active.itemCount ?? active.items.length} items (
          {Math.round((active.bytesCopied ?? 0) / 1024 / 1024)} MB copied){' '}
          <button
            type="button"
            onClick={() =>
              void window.filejam.operations
                .cancel(active.id)
                .catch((error) => setError(String(error)))
            }
          >
            Cancel
          </button>
        </p>
      )}
      {operations.length > 0 && (
        <details>
          <summary>Operation history (latest 50)</summary>
          <p>
            Emptying the OS trash makes trash undo unavailable. Removing
            operation recovery files disables their undo or redo.
          </p>
          {operations.map((operation) => (
            <div key={operation.id}>
              <p>
                {operation.kind}: {operation.status} (
                {operation.itemCount ?? operation.items.length} items)
              </p>
              {operation.error && <p role="alert">{operation.error}</p>}
              {operation.undoUnavailableReason && (
                <p role="status">{operation.undoUnavailableReason}</p>
              )}
              {operation.metadataWarning && (
                <p role="alert">{operation.metadataWarning}</p>
              )}
              {(['interrupted', 'partial', 'failed'].includes(
                operation.status,
              ) ||
                operation.metadataWarning) && (
                <button
                  type="button"
                  onClick={() =>
                    void window.filejam.operations
                      .recover(operation.id)
                      .catch((error) => setError(String(error)))
                  }
                >
                  Check recovery
                </button>
              )}
              {['partial', 'failed'].includes(operation.status) &&
                operation.direction !== 'undo' && (
                  <button
                    type="button"
                    onClick={() =>
                      void window.filejam.operations
                        .retry(operation.id)
                        .catch((error) => setError(String(error)))
                    }
                  >
                    Retry unfinished items
                  </button>
                )}
              {[...operation.items, ...(extraItems[operation.id] ?? [])].map(
                (item) => (
                  <p key={item.source}>
                    {item.source} → {item.target}: {item.status}
                    {item.error ? ` — ${item.error}` : ''}
                    {item.temporaryPath
                      ? ` Recovery copy: ${item.temporaryPath}`
                      : ''}
                    {item.backupPath
                      ? ` Replaced original: ${item.backupPath}`
                      : ''}
                    {item.recoveryPath
                      ? ` Undo storage: ${item.recoveryPath}`
                      : ''}
                    {item.retainedPaths?.map((path) => (
                      <span key={path}> Retained copy: {path}</span>
                    ))}
                  </p>
                ),
              )}
              {(operation.itemCount ?? operation.items.length) >
                operation.items.length +
                  (extraItems[operation.id]?.length ?? 0) && (
                <button type="button" onClick={() => void moreItems(operation)}>
                  Show next 100 items
                </button>
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  )
}
