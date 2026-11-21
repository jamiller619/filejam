import { Button, ButtonGroup, Icon } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { useRef, useState } from 'react'
import { useLocations } from '../../hooks/useLocations.js'
import type { DateFormat, FileColumn } from '../../utils/fileColumns.js'
import {
  fileColumnLabels,
  formatFileSize,
  formatFileValue,
  formatFileValueTitle,
  formatFullPath,
} from '../../utils/fileColumns.js'
import { getLocationIcon } from '../../utils/libraryIcon.js'
import ItemIcon, { IconButton } from '../icons/ItemIcon.js'
import DetailsPane from '../layout/DetailsPane.js'
import FileCollections from './FileCollections.js'
import FilePreview from './FilePreview.js'

import type { FileEntry } from './Files.types.js'

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

function entryIconTarget(entry: FileEntry) {
  return {
    kind: 'entry' as const,
    libraryId: entry.libraryId,
    relativePath: entry.relativePath,
  }
}

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
    .stackPreview {
      position: relative;
      display: grid;
      place-items: center;
      width: 180px;
      height: 180px;
      color: var(--suzy-action);

      > svg {
        position: absolute;
        padding: 12px;
        border: 1px solid var(--suzy-gray-7);
        border-radius: var(--suzy-radius-3);
        background: var(--suzy-gray-4);

        &:first-child {
          transform: translate(-18px, -8px) rotate(-12deg);
        }

        &:last-child {
          transform: translate(18px, 8px) rotate(12deg);
        }
      }
    }

    .names {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--suzy-space-2);

      > li {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--suzy-space-2);
      }
    }

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
  selectedEntries = [],
  libraryRoots,
  dateFormat,
  closing,
  onClose,
  onCollectionsChange,
}: {
  entry: FileEntry
  selectedEntries?: readonly FileEntry[]
  libraryRoots: ReadonlyMap<number, string>
  dateFormat: DateFormat
  closing: boolean
  onClose: () => void
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
  const { data: locations } = useLocations()

  const previewSection = useRef<HTMLDivElement>(null)
  const infoSection = useRef<HTMLDListElement>(null)
  const collectionsSection = useRef<HTMLDivElement>(null)
  const multipleSelected = selectedEntries.length > 1
  const selectedFiles = selectedEntries.filter(
    (item) => item.kind !== 'directory',
  )
  const folderCount = selectedEntries.length - selectedFiles.length
  const totalSize = selectedFiles.reduce(
    (total, item) => total + (item.size ?? 0),
    0,
  )
  const unknownSizeCount = selectedFiles.filter(
    (item) => item.size == null,
  ).length
  const title = multipleSelected
    ? `${selectedEntries.length} items selected`
    : (entry.presentation?.displayName ?? entry.name)
  const isFolder = entry.kind === 'directory'
  const displayName = entry.presentation?.displayName ?? entry.name
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

  function fullPathFor(item: FileEntry) {
    if (item.absolutePath) {
      return item.absolutePath
    }

    const rootPath = libraryRoots.get(item.libraryId)

    return rootPath === undefined
      ? undefined
      : formatFullPath(rootPath, item.relativePath)
  }

  const fullPath = fullPathFor(entry)
  const locationIcon = isFolder
    ? getLocationIcon(locations, fullPath)
    : undefined

  return (
    <DetailsPane
      bodyClassName={styles.details}
      ariaLabel={
        multipleSelected
          ? `Selection details: ${title}`
          : `${isFolder ? 'Folder' : 'File'} details: ${displayName}`
      }
      title={title}
      closing={closing}
      showCloseButton={false}
      onClose={onClose}
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
            {!multipleSelected && !isFolder && !entry.absolutePath && (
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
      {!multipleSelected && !entry.absolutePath && (
        <IconButton
          target={entryIconTarget(entry)}
          name={displayName}
          fallback={locationIcon && <Icon name={locationIcon} size={20} />}
          label
        />
      )}
      <div ref={previewSection} className={styles.preview}>
        {multipleSelected && (
          <div
            className={styles.stackPreview}
            role="img"
            aria-label="Stack of selected documents"
          >
            <Icon name="document" size={80} />
            <Icon name="document" size={80} />
            <Icon name="document" size={80} />
          </div>
        )}
        {!multipleSelected && isVideo && (
          // biome-ignore lint/a11y/useMediaCaption: Local videos do not include a separate captions source.
          <video key={videoSource} controls preload="metadata">
            <source src={videoSource} type={entry.mimeType ?? undefined} />
            Your browser does not support playing this video.
          </video>
        )}
        {!multipleSelected && !isVideo && (
          <FilePreview
            entry={entry}
            size="100%"
            variant="grid"
            locationIcon={locationIcon}
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
      {!multipleSelected && imageError?.id === entry.id && (
        <p role="alert">{imageError.message}</p>
      )}
      <dl ref={infoSection} className={styles.metadata}>
        {multipleSelected ? (
          <>
            <div>
              <dt>Items</dt>
              <dd>{selectedEntries.length}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>{selectedFiles.length}</dd>
            </div>
            <div>
              <dt>Folders</dt>
              <dd>{folderCount}</dd>
            </div>
            <div>
              <dt>Total file size</dt>
              <dd>
                {formatFileSize(totalSize)}
                {unknownSizeCount > 0 && ' (some sizes unavailable)'}
                {folderCount > 0 && ' (folder contents excluded)'}
              </dd>
            </div>
            <div>
              <dt>Names</dt>
              <dd>
                <ul className={styles.names}>
                  {selectedEntries.map((item) => {
                    const path = fullPathFor(item)
                    const folderIcon = item.kind === 'directory' && (
                      <Icon
                        name={getLocationIcon(locations, path) ?? 'folder'}
                        size={16}
                      />
                    )

                    return (
                      <li key={item.id} title={path ?? item.relativePath}>
                        {folderIcon &&
                          (item.absolutePath ? (
                            folderIcon
                          ) : (
                            <ItemIcon
                              target={entryIconTarget(item)}
                              size={16}
                              fallback={folderIcon}
                            />
                          ))}
                        <span>{item.name}</span>
                      </li>
                    )
                  })}
                </ul>
              </dd>
            </div>
          </>
        ) : (
          metadata
            .filter((column) => !entry.absolutePath || column !== 'indexedAt')
            .map((column) => (
              <div key={column}>
                <dt>{fileColumnLabels[column]}</dt>
                <dd title={formatFileValueTitle(entry, column, dateFormat)}>
                  {column === 'relativePath'
                    ? (fullPath ?? '—')
                    : formatFileValue(entry, column, dateFormat)}
                </dd>
              </div>
            ))
        )}
        {!multipleSelected &&
          Object.entries(entry.presentation?.details ?? {}).map(
            ([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
          )}
      </dl>
      {!multipleSelected && !isFolder && !entry.absolutePath && (
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
