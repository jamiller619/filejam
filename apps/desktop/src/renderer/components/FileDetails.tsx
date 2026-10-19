import { Button, Icon, Pill, ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FileColumn } from '../utils/fileColumns.js'
import {
  fileColumnLabels,
  formatFileValue,
  formatFileValueTitle,
  formatFullPath,
} from '../utils/fileColumns.js'
import FileCollections from './FileCollections.js'
import FilePreview from './FilePreview.js'

type FileEntry = Awaited<
  ReturnType<Window['files']['entries']['listChildren']>
>['entries'][number]

const metadata: readonly FileColumn[] = [
  'name',
  'relativePath',
  'kind',
  'mimeType',
  'size',
  'modifiedAt',
  'indexedAt',
  'tagReadError',
]

const styles = css`
  .panel {
    box-sizing: border-box;
    width: var(--details-width);
    flex-shrink: 0;
    pointer-events: auto;
    height: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--suzy-gray-4);
    color: var(--suzy-gray-12);
    /* border-radius: var(--suzy-radius-3); */

    &[data-closing='true'] {
      pointer-events: none;
    }

    .header {
      flex-shrink: 0;
      padding: var(--suzy-space-3);
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: var(--suzy-space-3);
    }

    .content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .contentBody {
      box-sizing: border-box;
      min-width: 0;
      padding: 0 var(--suzy-space-3) var(--suzy-space-3);
    }

    .title {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .preview {
      display: flex;
      justify-content: center;
      margin-block: var(--suzy-space-4);
    }
    .metadata {
      display: grid;
      gap: var(--suzy-space-3);
      background: var(--suzy-gray-5);
      color: var(--suzy-text-muted);
      padding: var(--suzy-space-3);
      border-radius: var(--suzy-radius-3);
      font-size: var(--suzy-font-size-1);
      > div {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: baseline;
        gap: var(--suzy-space-3);
      }
      dt {
        font-weight: 600;
        text-align: left;
        color: var(--suzy-text-muted);
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
        text-align: right;
        color: var(--suzy-text);
      }
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--suzy-space-2);
    }
  }
`

export default function FileDetails({
  entry,
  rootPath,
  closing,
  onClose,
  onClosed,
  onCollectionsChange,
}: {
  entry: FileEntry
  rootPath: string | undefined
  closing: boolean
  onClose: () => void
  onClosed: () => void
  onCollectionsChange: () => void
}) {
  const [imageError, setImageError] = useState<{
    id: number
    message: string
  } | null>(null)
  const panel = useRef<HTMLElement>(null)
  const closedCallback = useRef(onClosed)

  useLayoutEffect(() => {
    closedCallback.current = onClosed
  }, [onClosed])

  useLayoutEffect(() => {
    const element = panel.current
    const host = element?.parentElement
    if (!element || !host) return

    // One moving boundary controls both the content width and the pane position.
    // The pane stays full-size and left-aligned inside the clipped host.
    const from = host.getBoundingClientRect().width
    const to = closing ? 0 : element.getBoundingClientRect().width

    host.style.width = `${to}px`

    const animation = host.animate(
      [{ width: `${from}px` }, { width: `${to}px` }],
      {
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 180,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    )

    animation.onfinish = () => {
      if (closing) closedCallback.current()
    }

    return () => {
      host.style.width = `${host.getBoundingClientRect().width}px`

      animation.onfinish = null
      animation.cancel()
    }
  }, [closing])

  useLayoutEffect(() => {
    const host = panel.current?.parentElement
    return () => {
      if (host) host.style.width = '0px'
    }
  }, [])

  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement
    closeButton.current?.focus()

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (closing) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closing, onClose])

  return (
    <aside
      ref={panel}
      className={styles.panel}
      data-closing={closing}
      inert={closing}
      aria-label={`File details: ${entry.name}`}
    >
      <header className={styles.header}>
        <h4 className={styles.title}>{entry.name}</h4>
        <Button
          ref={closeButton}
          // className={styles.close}
          onClick={onClose}
          aria-label="Close file details"
        >
          <Icon name="close" size={16} />
        </Button>
      </header>
      <div className={styles.content}>
        <ScrollArea>
          <div className={styles.contentBody}>
            <div className={styles.preview}>
              <FilePreview
                entry={entry}
                size="100%"
                onOpen={() => {
                  setImageError(null)
                  void window.files
                    .openImage(entry.libraryId, entry.relativePath)
                    .catch(() => {
                      setImageError({
                        id: entry.id,
                        message:
                          'This image could not be opened. It may have been moved, deleted, or be unsupported.',
                      })
                    })
                }}
              />
            </div>
            {imageError?.id === entry.id && (
              <p role="alert">{imageError.message}</p>
            )}
            <dl className={styles.metadata}>
              {metadata.map((column) => (
                <div key={column}>
                  <dt>{fileColumnLabels[column]}</dt>
                  <dd title={formatFileValueTitle(entry, column)}>
                    {column === 'relativePath'
                      ? rootPath === undefined
                        ? '—'
                        : formatFullPath(rootPath, entry.relativePath)
                      : formatFileValue(entry, column)}
                  </dd>
                </div>
              ))}
            </dl>
            <FileCollections
              key={entry.id}
              entryId={entry.id}
              onChange={onCollectionsChange}
            />
            <section aria-label="Tags">
              <h5>Tags</h5>
              <div className={styles.tags}>
                {entry.tags.length
                  ? entry.tags.map((tag) => <Pill key={tag}>{tag}</Pill>)
                  : 'No tags'}
              </div>
            </section>
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}
