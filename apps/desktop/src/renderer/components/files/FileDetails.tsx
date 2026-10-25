import { Button, ButtonGroup, Icon } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { useRef, useState } from 'react'
import type { DateFormat, FileColumn } from '../../utils/fileColumns.js'
import {
  fileColumnLabels,
  formatFileValue,
  formatFileValueTitle,
  formatFullPath,
} from '../../utils/fileColumns.js'
import DetailsPane from '../layout/DetailsPane.js'
import FileCollections from './FileCollections.js'
import FilePreview from './FilePreview.js'

type FileEntry = Awaited<
  ReturnType<Window['filejam']['entries']['listChildren']>
>['entries'][number]

const metadata: readonly FileColumn[] = [
  'name',
  'relativePath',
  'kind',
  'mimeType',
  'size',
  'createdAt',
  'modifiedAt',
  'indexedAt',
]

const styles = css`
  .sectionNav {
    flex-shrink: 0;
    padding: var(--suzy-space-2) var(--suzy-space-3) var(--suzy-space-3);
    background: var(--suzy-gray-4);
  }

  .sectionButtons {
    width: 100%;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    border-radius: calc(var(--suzy-radius-4) + 3px);
    background: lch(from var(--suzy-gray-3) l c h / 70%);

    > button {
      box-sizing: border-box;
      width: auto;
      height: 58px;
      min-height: 58px;
      padding: var(--suzy-space-2);
      margin: 3px;
      border-radius: var(--suzy-radius-4);
      display: flex;
      flex-direction: column;
      gap: 3px;
      color: var(--suzy-text-muted);
      font-size: var(--suzy-font-size-1);
      line-height: 1;

      &:hover {
        color: var(--suzy-text);
        background: var(--suzy-gray-5);
      }

      &:focus-visible {
        color: var(--suzy-text);
        outline: 2px solid var(--suzy-action);
        outline-offset: -2px;
      }

      &[aria-pressed='true'] {
        color: var(--suzy-action);
      }
    }
  }

  .details {
    .preview {
      display: flex;
      justify-content: center;
      margin-block: var(--suzy-space-4);

      video {
        display: block;
        width: 100%;
        max-height: min(50vh, 420px);
        border-radius: var(--suzy-radius-4);
        background: #000;
        corner-shape: var(--suzy-corner-shape);
      }
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
  }
`

export default function FileDetails({
  entry,
  rootPath,
  dateFormat,
  closing,
  onClose,
  onClosed,
  onCollectionsChange,
}: {
  entry: FileEntry
  rootPath: string | undefined
  dateFormat: DateFormat
  closing: boolean
  onClose: () => void
  onClosed: () => void
  onCollectionsChange: () => void
}) {
  const [imageError, setImageError] = useState<{
    id: number
    message: string
  } | null>(null)
  const [sectionSelection, setSectionSelection] = useState<{
    entryId: number
    name: 'preview' | 'info' | 'collections'
  }>({ entryId: entry.id, name: 'preview' })

  const previewSection = useRef<HTMLDivElement>(null)
  const infoSection = useRef<HTMLDListElement>(null)
  const collectionsSection = useRef<HTMLDivElement>(null)
  const isFolder = entry.kind === 'directory'
  const isVideo = entry.mimeType?.startsWith('video/') ?? false
  const videoSource = `filejam-preview://video?${new URLSearchParams({
    libraryId: String(entry.libraryId),
    path: entry.relativePath,
    v: String(entry.modifiedAt),
  })}`

  function scrollToSection(
    name: 'preview' | 'info' | 'collections',
    section: HTMLElement | null,
  ) {
    setSectionSelection({ entryId: entry.id, name })

    section?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    })
  }

  const activeSection =
    sectionSelection.entryId === entry.id ? sectionSelection.name : 'preview'

  return (
    <DetailsPane
      bodyClassName={styles.details}
      ariaLabel={`${isFolder ? 'Folder' : 'File'} details: ${entry.name}`}
      title={entry.name}
      closing={closing}
      showCloseButton={false}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <nav className={styles.sectionNav} aria-label="Detail sections">
          <ButtonGroup className={styles.sectionButtons} role="group">
            <Button
              variant="ghost"
              aria-pressed={activeSection === 'preview'}
              onClick={() => scrollToSection('preview', previewSection.current)}
            >
              <Icon name="image" size={21} />
              <span>Preview</span>
            </Button>
            <Button
              variant="ghost"
              aria-pressed={activeSection === 'info'}
              onClick={() => scrollToSection('info', infoSection.current)}
            >
              <Icon name="list" size={21} />
              <span>Info</span>
            </Button>
            {!isFolder && (
              <Button
                variant="ghost"
                aria-pressed={activeSection === 'collections'}
                onClick={() =>
                  scrollToSection('collections', collectionsSection.current)
                }
              >
                <Icon name="heart" size={21} />
                <span>Collections</span>
              </Button>
            )}
          </ButtonGroup>
        </nav>
      }
    >
      <div ref={previewSection} className={styles.preview}>
        {isVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: Local videos do not include a separate captions source.
          <video key={videoSource} controls preload="metadata">
            <source src={videoSource} type={entry.mimeType ?? undefined} />
            Your browser does not support playing this video.
          </video>
        ) : (
          <FilePreview
            entry={entry}
            size="100%"
            onOpen={() => {
              setImageError(null)

              void window.filejam
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
        )}
      </div>
      {imageError?.id === entry.id && <p role="alert">{imageError.message}</p>}
      <dl ref={infoSection} className={styles.metadata}>
        {metadata.map((column) => (
          <div key={column}>
            <dt>{fileColumnLabels[column]}</dt>
            <dd title={formatFileValueTitle(entry, column, dateFormat)}>
              {column === 'relativePath'
                ? rootPath === undefined
                  ? '—'
                  : formatFullPath(rootPath, entry.relativePath)
                : formatFileValue(entry, column, dateFormat)}
            </dd>
          </div>
        ))}
      </dl>
      {!isFolder && (
        <div ref={collectionsSection}>
          <FileCollections
            key={entry.id}
            entryId={entry.id}
            onChange={onCollectionsChange}
          />
        </div>
      )}
    </DetailsPane>
  )
}
