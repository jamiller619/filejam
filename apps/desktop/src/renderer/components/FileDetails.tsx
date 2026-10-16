import { Icon, Pill, ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { useEffect, useRef } from 'react'
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
    width: 100%;
    height: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--suzy-gray-4);
    color: var(--suzy-gray-12);
    border-radius: var(--suzy-radius-3);
    animation: reveal 160ms ease-out;

    &[data-closing='true'] {
      animation: dismiss 80ms ease-in forwards;
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

    .close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: var(--suzy-space-2);
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
    @media (prefers-reduced-motion: reduce) {
      &, &[data-closing='true'] {
        animation-duration: 1ms;
      }
    }
  }
  @keyframes reveal {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes dismiss {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
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
      className={styles.panel}
      data-closing={closing}
      inert={closing}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClosed()
      }}
      aria-label={`File details: ${entry.name}`}
    >
      <header className={styles.header}>
        <h4 className={styles.title}>{entry.name}</h4>
        <button
          ref={closeButton}
          className={styles.close}
          type="button"
          onClick={onClose}
          aria-label="Close file details"
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className={styles.content}>
        <ScrollArea>
          <div className={styles.contentBody}>
            <div className={styles.preview}>
              <FilePreview entry={entry} size="100%" />
            </div>
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
