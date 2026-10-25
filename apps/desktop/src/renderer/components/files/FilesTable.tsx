import { Surface } from '@filejam/ui'
import { useVirtualizer } from '@tanstack/react-virtual'
import { css } from 'inline-css-modules'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useFolderDrop } from '../../hooks/useFolderDrop.js'
import { colorForFileValue } from '../../utils/fileColors.js'
import {
  type DateFormat,
  type FileColumn,
  fileColumnLabels,
  formatFileValue,
  formatFileValueTitle,
  formatFullPath,
} from '../../utils/fileColumns.js'
import { folderDragProps } from '../../utils/folderDrag.js'
import { folderUrl } from '../../utils/folderUrl.js'
import FileName, { fileColorForName } from './FileName.js'
import FilePreview from './FilePreview.js'
import { minimumNameColumnWidth, selectedFileColor } from './Files.constants.js'
import type {
  FileRowGroup,
  FilesTableModel,
  FolderListing,
  Listing,
} from './Files.types.js'
import FilesGroupToggle from './FilesGroupToggle.js'

const styles = css`
  @keyframes folder-drag-lift {
    0% { transform: translateY(0) scale(1); }
    55% { transform: translateY(-3px) scale(1.015); }
    100% { transform: translateY(0) scale(1); }
  }

  .container { min-width: 0; }
  .scroll {
    overflow-x: clip;
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
  .virtualSpacer td {
    height: var(--files-virtual-spacer-height);
    padding: 0;
  }
  .table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    text-align: left;

    th, td {
      vertical-align: middle;
      padding-inline: var(--suzy-space-2);
    }
    [data-column='size'] { text-align: right; }
    [data-value-color='blue'] { color: light-dark(#006adc, #70b8ff); }
    [data-value-color='cyan'] { color: light-dark(#00749e, #4ccce6); }
    [data-value-color='green'] { color: light-dark(#18794e, #4cc38a); }
    [data-value-color='orange'] { color: light-dark(#cc4e00, #ffa057); }
    [data-value-color='pink'] { color: light-dark(#cd1d8d, #f65cb6); }
    [data-value-color='purple'] { color: light-dark(#8145b5, #be93e4); }
    [data-value-color='red'] { color: light-dark(#ce2c31, #ff6369); }
    [data-value-color='yellow'] { color: light-dark(#946800, #f5d90a); }

    .emptyState {
      padding: var(--suzy-space-6) var(--suzy-space-3);
      text-align: center;
      font-size: 1.125em;
    }
    .groupRow th {
      position: static;
      padding: var(--suzy-space-1) 0 0;
      color: var(--suzy-gray-11);
      background: var(--suzy-gray-2);
      font-weight: 600;
    }
    th {
      padding-inline: 0;
      font-weight: 400;
      white-space: nowrap;
      position: sticky;
      top: calc(var(--files-sticky-offset, 0px) + 48px);
      z-index: 1;
      background: var(--suzy-gray-2);
      border-radius: var(--suzy-radius-3);

      &:hover { background: lch(from var(--suzy-gray-5) l c h / 70%); }
    }
    .resizer {
      position: absolute;
      top: 0;
      right: 0;
      width: 8px;
      height: var(--files-table-height, 100%);
      padding: 0;
      border: 0;
      background: transparent;
      cursor: ew-resize;
      touch-action: none;
      user-select: none;

      &::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 4px;
        border-radius: var(--suzy-radius-full);
        transition: background-color 120ms ease;
      }
      &:hover::after, &:focus-visible::after, &[data-resizing='true']::after {
        background: var(--suzy-accent-9);
        transition-delay: 250ms;
      }
      &:focus-visible { outline: none; }
    }
    .file {
      display: flex;
      min-width: 0;
      width: 100%;
      align-items: center;
      gap: var(--suzy-space-1);
    }
    .sort {
      display: block;
      width: 100%;
      text-align: inherit;
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0 var(--suzy-space-2);
      cursor: pointer;
    }
    .groupRow + .row > td:first-child { border-top-left-radius: var(--suzy-radius-3); }
    .groupRow + .row > td:last-child { border-top-right-radius: var(--suzy-radius-3); }
    .row:has(+ .groupRow) > td:first-child { border-bottom-left-radius: var(--suzy-radius-3); }
    .row:has(+ .groupRow) > td:last-child { border-bottom-right-radius: var(--suzy-radius-3); }
    .row {
      overflow: hidden;
      position: relative;

      &[data-folder-dragging='true'] {
        opacity: 0.45;
        animation: folder-drag-lift var(--suzy-duration-normal) cubic-bezier(0.2, 1.4, 0.4, 1) both;
        will-change: transform, opacity;
      }
      > td { background: var(--suzy-gray-3); }
      &:hover > td, &:focus-within > td { background: var(--suzy-gray-4); }
      &[data-selected='true'] > td {
        background: var(--suzy-accent-9);
        color: var(--suzy-accent-1);
      }
      &[data-selected='true'] [data-extension-color] { --file-name-color: var(--suzy-accent-1); }
      &[data-selected='true'] [data-value-color] { color: var(--suzy-accent-1); }
      &:first-child > td:first-child { border-top-left-radius: var(--suzy-radius-4); }
      &:first-child > td:last-child { border-top-right-radius: var(--suzy-radius-4); }
      &:last-child > td:first-child { border-bottom-left-radius: var(--suzy-radius-4); }
      &:last-child > td:last-child { border-bottom-right-radius: var(--suzy-radius-4); }
    }
    .name {
      font: inherit;
      color: inherit;
      text-align: left;
      text-decoration: none;
      background: none;
      border: 0;
      padding: 0;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        cursor: pointer;
      }
      &:focus-visible { outline: none; }
      &:focus-visible::after {
        outline: 2px solid currentColor;
        outline-offset: -2px;
      }
      &[data-folder-drop-active='true']::after {
        outline: 2px solid var(--suzy-accent-9);
        outline-offset: -2px;
      }
      &[data-folder-drop-failed='true']::after {
        outline: 2px solid var(--suzy-danger-9);
        outline-offset: -2px;
      }
    }
  }
  .nameCell { width: 100%; max-width: 0; }
`

function findVerticalScrollElement(element: HTMLElement | null) {
  let candidate = element?.parentElement ?? null

  while (candidate) {
    const { overflowY } = window.getComputedStyle(candidate)

    if (overflowY === 'auto' || overflowY === 'scroll') {
      return candidate
    }

    candidate = candidate.parentElement
  }

  return null
}

type FilesTableProps = {
  table: FilesTableModel
  listing: Listing
  rowGroups: FileRowGroup[]
  collapsedGroupKeys: ReadonlySet<string>
  libraryRoots: ReadonlyMap<number, string>
  selectedId: number | null
  selectedIds: ReadonlySet<number>
  search: string | undefined
  dateFormat: DateFormat
  groupReferenceDate: Date
  ariaLabel: string
  onActivateFile: (id: number) => void
  onToggleGroup: (key: string) => void
  onWidthChange: (width: number) => void
}

export default function FilesTable({
  table,
  listing,
  rowGroups,
  collapsedGroupKeys,
  libraryRoots,
  selectedId,
  selectedIds,
  search,
  dateFormat,
  groupReferenceDate,
  ariaLabel,
  onActivateFile,
  onToggleGroup,
  onWidthChange,
}: FilesTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tableElement, setTableElement] = useState<HTMLTableElement | null>(
    null,
  )
  const [scrollMargin, setScrollMargin] = useState(0)
  const virtualRows = useMemo(
    () =>
      rowGroups.flatMap((group) => [
        ...(group.label === null
          ? []
          : [{ key: `group:${group.key}`, type: 'group' as const, group }]),
        ...(collapsedGroupKeys.has(group.key)
          ? []
          : group.rows.map((row) => ({
              key: `row:${row.id}`,
              type: 'row' as const,
              row,
            }))),
      ]),
    [collapsedGroupKeys, rowGroups],
  )
  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => findVerticalScrollElement(containerRef.current),
    estimateSize: (index) => (virtualRows[index]?.type === 'group' ? 36 : 32),
    getItemKey: (index) => virtualRows[index]?.key ?? index,
    overscan: 10,
    scrollMargin,
  })
  const virtualItems = rowVirtualizer.getVirtualItems()
  const firstVirtualItem = virtualItems[0]
  const lastVirtualItem = virtualItems.at(-1)
  const virtualPaddingTop = firstVirtualItem
    ? firstVirtualItem.start - scrollMargin
    : 0
  const virtualPaddingBottom = lastVirtualItem
    ? rowVirtualizer.getTotalSize() - (lastVirtualItem.end - scrollMargin)
    : 0
  const columnCount = table.getVisibleLeafColumns().length

  useLayoutEffect(() => {
    const container = containerRef.current

    if (!container || !tableElement) {
      return
    }

    const updateTableSize = () => {
      onWidthChange(container.clientWidth)
      tableElement.style.setProperty(
        '--files-table-height',
        `${tableElement.offsetHeight}px`,
      )

      const scrollElement = findVerticalScrollElement(container)
      const tableBody = tableElement.tBodies[0]

      if (scrollElement && tableBody) {
        setScrollMargin(
          tableBody.getBoundingClientRect().top -
            scrollElement.getBoundingClientRect().top +
            scrollElement.scrollTop,
        )
      }
    }
    const observer = new ResizeObserver(updateTableSize)

    updateTableSize()
    observer.observe(container)
    observer.observe(tableElement)

    return () => observer.disconnect()
  }, [onWidthChange, tableElement])

  return (
    <div ref={containerRef} className={styles.container}>
      <Surface className={styles.scroll}>
        <table
          ref={setTableElement}
          className={styles.table}
          aria-label={ariaLabel}
          aria-rowcount={virtualRows.length + 1}
          style={{ minWidth: table.getTotalSize() }}
        >
          <colgroup>
            {table.getVisibleLeafColumns().map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {(table.getHeaderGroups()[0]?.headers ?? []).map((header) => (
                <th
                  key={header.id}
                  data-column={header.column.id}
                  scope="col"
                  aria-sort={
                    header.column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                >
                  <button
                    type="button"
                    className={styles.sort}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {fileColumnLabels[header.column.id as FileColumn]}
                    {header.column.getIsSorted() === 'asc'
                      ? ' ↑'
                      : header.column.getIsSorted() === 'desc'
                        ? ' ↓'
                        : ''}
                  </button>
                  <button
                    type="button"
                    className={styles.resizer}
                    aria-label={`Resize ${fileColumnLabels[header.column.id as FileColumn]} column`}
                    data-resizing={header.column.getIsResizing()}
                    onDoubleClick={() => header.column.resetSize()}
                    onKeyDown={(event) => {
                      if (
                        event.key !== 'ArrowLeft' &&
                        event.key !== 'ArrowRight'
                      ) {
                        return
                      }

                      event.preventDefault()

                      const minimumSize =
                        header.column.id === 'name'
                          ? minimumNameColumnWidth
                          : 80
                      const direction = event.key === 'ArrowRight' ? 1 : -1

                      table.setColumnSizing((current) => ({
                        ...current,
                        [header.column.id]: Math.min(
                          600,
                          Math.max(
                            minimumSize,
                            header.column.getSize() + direction * 10,
                          ),
                        ),
                      }))
                    }}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listing.scanned && listing.entries.length === 0 && (
              <tr>
                <td
                  className={styles.emptyState}
                  role="status"
                  colSpan={columnCount}
                >
                  {search
                    ? 'No matching files or folders.'
                    : 'No files to display.'}
                </td>
              </tr>
            )}
            {virtualPaddingTop > 0 && (
              <VirtualSpacer
                height={virtualPaddingTop}
                columnCount={columnCount}
              />
            )}
            {virtualItems.map((virtualItem) => {
              const item = virtualRows[virtualItem.index]

              if (!item) {
                return null
              }

              if (item.type === 'group') {
                return (
                  <tr
                    key={item.key}
                    ref={rowVirtualizer.measureElement}
                    className={styles.groupRow}
                    data-index={virtualItem.index}
                    aria-rowindex={virtualItem.index + 2}
                  >
                    <th colSpan={columnCount}>
                      <FilesGroupToggle
                        expanded={!collapsedGroupKeys.has(item.group.key)}
                        label={item.group.label ?? ''}
                        onClick={() => onToggleGroup(item.group.key)}
                      />
                    </th>
                  </tr>
                )
              }

              const { row } = item
              const entry = row.original
              const entryPath =
                entry.kind === 'directory' && libraryRoots.has(entry.libraryId)
                  ? formatFullPath(
                      libraryRoots.get(entry.libraryId) ?? '',
                      entry.relativePath,
                    )
                  : undefined

              return (
                <tr
                  key={item.key}
                  ref={rowVirtualizer.measureElement}
                  className={styles.row}
                  data-index={virtualItem.index}
                  aria-rowindex={virtualItem.index + 2}
                  data-selected={selectedIds.has(entry.id)}
                  data-file-id={entry.id}
                  data-folder-drag-preview={entryPath ? true : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const column = cell.column.id as FileColumn

                    return (
                      <td
                        key={column}
                        data-column={column}
                        className={
                          column === 'name' ? styles.nameCell : undefined
                        }
                        title={formatFileValueTitle(entry, column, dateFormat)}
                      >
                        {column === 'name' ? (
                          <span className={styles.file}>
                            <FilePreview
                              entry={entry}
                              color={
                                entry.kind === 'directory'
                                  ? undefined
                                  : selectedIds.has(entry.id)
                                    ? selectedFileColor
                                    : fileColorForName(entry.name)
                              }
                            />
                            {entry.kind === 'directory' ? (
                              <FolderNameLink
                                entry={entry}
                                path={entryPath}
                                highlight={search}
                                className={styles.name}
                              />
                            ) : (
                              <button
                                type="button"
                                className={styles.name}
                                title={entry.name}
                                onClick={() => onActivateFile(entry.id)}
                                aria-label={`Show details for ${entry.name}`}
                                aria-expanded={selectedId === entry.id}
                              >
                                <FileName
                                  name={entry.name}
                                  highlight={search}
                                />
                              </button>
                            )}
                          </span>
                        ) : (
                          <span
                            data-value-color={colorForFileValue(
                              column,
                              entry[column],
                              groupReferenceDate,
                            )}
                          >
                            {column === 'relativePath'
                              ? cell.getValue<string>()
                              : formatFileValue(entry, column, dateFormat)}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {virtualPaddingBottom > 0 && (
              <VirtualSpacer
                height={virtualPaddingBottom}
                columnCount={columnCount}
              />
            )}
          </tbody>
        </table>
      </Surface>
    </div>
  )
}

function VirtualSpacer({
  height,
  columnCount,
}: {
  height: number
  columnCount: number
}) {
  return (
    <tr
      className={styles.virtualSpacer}
      style={
        {
          '--files-virtual-spacer-height': `${height}px`,
        } as React.CSSProperties
      }
    >
      <td colSpan={columnCount} />
    </tr>
  )
}

function FolderNameLink({
  entry,
  path,
  highlight,
  className,
}: {
  entry: FolderListing['entries'][number]
  path: string | undefined
  highlight: string | undefined
  className: string | undefined
}) {
  const folderDropProps = useFolderDrop(path)
  const folderSourceProps = folderDragProps(path)

  return (
    <Link
      {...folderDropProps}
      {...folderSourceProps}
      className={className}
      title={entry.name}
      viewTransition
      to={folderUrl({
        libraryId: entry.libraryId,
        relativePath: entry.relativePath,
      })}
      onDragEnd={(event) => {
        folderSourceProps.onDragEnd(event)
        folderDropProps.onDragEnd()
      }}
    >
      <FileName name={entry.name} isDirectory={true} highlight={highlight} />
    </Link>
  )
}
