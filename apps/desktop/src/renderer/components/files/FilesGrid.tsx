import { Surface } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { Fragment } from 'react'
import { formatFullPath } from '../../utils/fileColumns.js'
import { folderDragProps } from '../../utils/folderDrag.js'
import { folderUrl } from '../../utils/folderUrl.js'
import type { FileViewMode } from '../../utils/tablePreferences.js'
import { fileColorForName } from './FileName.js'
import FilePreview from './FilePreview.js'
import { selectedFileColor } from './Files.constants.js'
import type { FileEntry, FileRowGroup, Listing } from './Files.types.js'
import FilesGroupToggle from './FilesGroupToggle.js'
import GridCard from './GridCard.js'
import GridContainer from './GridContainer.js'
import MasonryContainer from './MasonryContainer.js'

const styles = css`
  .empty { padding: var(--suzy-space-6); text-align: center; }
  .groupHeading {
    grid-column: 1 / -1;
    padding: 0;
    color: var(--suzy-gray-11);
    font-weight: 600;
  }
  .scroll {
    overflow-x: clip;
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
`

type FilesGridProps = {
  listing: Listing
  viewMode: Exclude<FileViewMode, 'list'>
  cardSize: number
  rowGroups: FileRowGroup[]
  collapsedGroupKeys: ReadonlySet<string>
  volumeRoots: ReadonlyMap<number, string>
  selectedId: number | null
  selectedIds: ReadonlySet<number>
  search: string | undefined
  showFileExtensions: boolean
  ariaLabel: string
  onActivateFile: (id: number) => void
  onOpenEntry: (id: number) => void
  onToggleGroup: (key: string) => void
}

export default function FilesGrid({
  listing,
  viewMode,
  cardSize,
  rowGroups,
  collapsedGroupKeys,
  volumeRoots,
  selectedId,
  selectedIds,
  search,
  showFileExtensions,
  ariaLabel,
  onActivateFile,
  onOpenEntry,
  onToggleGroup,
}: FilesGridProps) {
  function renderFileCard(entry: FileEntry, masonry: boolean) {
    const displayName = entry.presentation?.displayName ?? entry.name
    const folderPath =
      entry.kind === 'directory' && volumeRoots.has(entry.volumeId)
        ? formatFullPath(
            volumeRoots.get(entry.volumeId) ?? '',
            entry.relativePath,
          )
        : undefined

    return (
      <GridCard
        as={masonry ? 'div' : 'li'}
        name={displayName}
        isDirectory={entry.kind === 'directory'}
        highlight={search}
        showExtension={showFileExtensions}
        selected={selectedIds.has(entry.id)}
        previewOnly={masonry}
        fileId={entry.id}
        folderPath={folderPath}
        {...(entry.kind === 'directory'
          ? {
              ...folderDragProps(folderPath),
              to: folderUrl({
                volumeId: entry.volumeId,
                relativePath: entry.relativePath,
              }),
            }
          : {
              onClick: () => onActivateFile(entry.id),
              onDoubleClick: entry.presentation?.activation
                ? () => onOpenEntry(entry.id)
                : undefined,
              'aria-label': `Show details for ${displayName}`,
              'aria-expanded': selectedId === entry.id,
            })}
      >
        <FilePreview
          entry={entry}
          size="100%"
          variant="grid"
          naturalSize={masonry}
          color={
            entry.kind === 'directory'
              ? undefined
              : selectedIds.has(entry.id)
                ? selectedFileColor
                : fileColorForName(entry.name)
          }
        />
      </GridCard>
    )
  }

  if (listing.scanned && listing.entries.length === 0) {
    return (
      <Surface className={styles.scroll}>
        <p role="status" className={styles.empty}>
          {search ? 'No matching files or folders.' : 'No files to display.'}
        </p>
      </Surface>
    )
  }

  if (viewMode === 'masonry') {
    return (
      <MasonryContainer
        aria-label={ariaLabel}
        cardSize={cardSize}
        sections={rowGroups.map((group) => ({
          key: group.key,
          heading:
            group.label === null ? undefined : (
              <div className={styles.groupHeading}>
                <FilesGroupToggle
                  expanded={!collapsedGroupKeys.has(group.key)}
                  label={group.label}
                  onClick={() => onToggleGroup(group.key)}
                />
              </div>
            ),
          items: collapsedGroupKeys.has(group.key)
            ? []
            : group.rows.map(({ original: entry }) => ({
                key: entry.id,
                content: renderFileCard(entry, true),
              })),
        }))}
      />
    )
  }

  return (
    <GridContainer aria-label={ariaLabel} cardSize={cardSize}>
      {rowGroups.map((group) => (
        <Fragment key={group.key}>
          {group.label !== null && (
            <li className={styles.groupHeading} data-group-heading="true">
              <FilesGroupToggle
                expanded={!collapsedGroupKeys.has(group.key)}
                label={group.label}
                onClick={() => onToggleGroup(group.key)}
              />
            </li>
          )}
          {!collapsedGroupKeys.has(group.key) &&
            group.rows.map(({ original: entry }) => (
              <Fragment key={entry.id}>{renderFileCard(entry, false)}</Fragment>
            ))}
        </Fragment>
      ))}
    </GridContainer>
  )
}
