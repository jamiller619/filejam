import { Icon, Surface } from '@files/ui'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { css } from 'inline-css-modules'
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { useApi } from '../hooks/useApi.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { useConfig } from '../hooks/useConfig.js'
import { useFileSelection } from '../hooks/useFileSelection.js'
import { useFolderDrop } from '../hooks/useFolderDrop.js'
import { useLibraries } from '../hooks/useLibraries.js'
import { usePageCardSizeControl, usePageFolderStats } from '../pages/Page.js'
import { queryKeys } from '../queryClient.js'
import { colorForFileValue } from '../utils/fileColors.js'
import {
  type FileColumn,
  fileColumnLabels,
  formatFileValue,
  formatFileValueTitle,
  formatFullPath,
} from '../utils/fileColumns.js'
import { folderDragProps } from '../utils/folderDrag.js'
import { folderUrl } from '../utils/folderUrl.js'
import {
  readTablePreferences,
  writeTablePreferences,
} from '../utils/tablePreferences.js'
import { useDetailsPane } from './DetailsPaneContext.js'
import FileDetails from './FileDetails.js'
import FileName, { fileColorForName } from './FileName.js'
import FilePreview from './FilePreview.js'
import FilesToolbar from './FilesToolbar.js'
import GridCard from './GridCard.js'
import GridContainer from './GridContainer.js'
import MasonryContainer from './MasonryContainer.js'
import { useSearch } from './SearchContext.js'

export type { FileColumn } from '../utils/fileColumns.js'

const emptyEntries: Listing['entries'] = []

const selectedFileColor = { light: '#f9feff', dark: '#0d141f' }

const defaultColumns: readonly FileColumn[] = [
  'name',
  'createdAt',
  'modifiedAt',
  'size',
]

const minimumNameColumnWidth = 240

const defaultColumnWidths: Partial<Record<FileColumn, number>> = {
  name: minimumNameColumnWidth,
  relativePath: 260,
  mimeType: 200,
  createdAt: 180,
  modifiedAt: 180,
  indexedAt: 180,
  childrenScannedAt: 180,
  kind: 130,
  childrenDirty: 130,
  size: 110,
  id: 110,
  libraryId: 110,
  parentId: 110,
}

export type Folder = Parameters<Window['files']['entries']['listChildren']>[0]

type FolderListing = Awaited<
  ReturnType<Window['files']['entries']['listChildren']>
>

type Listing =
  | FolderListing
  | Awaited<ReturnType<Window['files']['collections']['listEntries']>>

type DateRangeGroup = {
  key: string
  label: string
  order: number
}

export type FilesProps = {
  folder?: Folder | undefined
  collectionId?: string | undefined
  columns?: readonly FileColumn[]
  preferencesScope?: string | undefined
  reportFolderStats?: boolean | undefined
}

const styles = css`
  @keyframes folder-drag-lift {
    0% { transform: translateY(0) scale(1); }
    55% { transform: translateY(-3px) scale(1.015); }
    100% { transform: translateY(0) scale(1); }
  }

  .gridEmpty { padding: var(--suzy-space-6); text-align: center; }
  .groupHeading {
    grid-column: 1 / -1;
    padding: 0;
    color: var(--suzy-gray-11);
    font-weight: 600;
  }
  .groupToggle {
    display: flex;
    width: 100%;
    align-items: center;
    gap: var(--suzy-space-2);
    padding: var(--suzy-space-2);
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    &:hover { color: var(--suzy-gray-12); }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); }
  }
  .groupChevron {
    flex: 0 0 auto;
    transition: transform 120ms ease;
    [aria-expanded='true'] & { transform: rotate(90deg); }
  }
  .scroll {
    overflow-x: clip;
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
  .tableContainer {
    min-width: 0;
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

    [data-column='size'] {
      text-align: right;
    }

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

      &:hover {
        background: lch(from var(--suzy-gray-5) l c h / 70%);
      }
    }
    .resizer {
      position: absolute;
      top: 0;
      right: 0px;
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
        /* right: 4px; */
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
    .groupRow + .row > td:first-child {
      border-top-left-radius: var(--suzy-radius-3);
    }
    .groupRow + .row > td:last-child {
      border-top-right-radius: var(--suzy-radius-3);
    }
    .row:has(+ .groupRow) > td:first-child {
      border-bottom-left-radius: var(--suzy-radius-3);
    }
    .row:has(+ .groupRow) > td:last-child {
      border-bottom-right-radius: var(--suzy-radius-3);
    }
    .row {
      overflow: hidden;
      position: relative;
      &[data-folder-dragging='true'] {
        opacity: 0.45;
        animation: folder-drag-lift var(--suzy-duration-normal) cubic-bezier(0.2, 1.4, 0.4, 1) both;
        will-change: transform, opacity;
      }
      > td {
        background: var(--suzy-gray-3);
      }
      &:hover > td, &:focus-within > td {
        background: var(--suzy-gray-4);
      }
      &[data-selected='true'] > td {
        background: var(--suzy-accent-9);
        color: var(--suzy-accent-1);
      }
      &[data-selected='true'] [data-extension-color] {
        --file-name-color: var(--suzy-accent-1);
      }
      &[data-selected='true'] [data-value-color] {
        color: var(--suzy-accent-1);
      }
      &:first-child > td:first-child {
        border-top-left-radius: var(--suzy-radius-4);
      }
      &:first-child > td:last-child {
        border-top-right-radius: var(--suzy-radius-4);
      }
      &:last-child > td:first-child {
        border-bottom-left-radius: var(--suzy-radius-4);
      }
      &:last-child > td:last-child {
        border-bottom-right-radius: var(--suzy-radius-4);
      }
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
      &:focus-visible {
        outline: none;
      }
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
  .nameCell {
    width: 100%;
    max-width: 0;
  }
`

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDateRangeGroup(date: Date, referenceDate: Date): DateRangeGroup {
  const today = startOfDay(referenceDate)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const thisWeek = new Date(today)
  thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay())

  const lastWeek = new Date(thisWeek)
  lastWeek.setDate(lastWeek.getDate() - 7)

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const thisYear = new Date(today.getFullYear(), 0, 1)

  if (date >= today) {
    return { key: 'today', label: 'Today', order: 0 }
  }

  if (date >= yesterday) {
    return { key: 'yesterday', label: 'Yesterday', order: 1 }
  }

  if (date >= thisWeek) {
    return { key: 'this-week', label: 'Earlier this week', order: 2 }
  }

  if (date >= lastWeek) {
    return { key: 'last-week', label: 'Last week', order: 3 }
  }

  if (date >= thisMonth) {
    return { key: 'this-month', label: 'Earlier this month', order: 4 }
  }

  if (date >= lastMonth) {
    return { key: 'last-month', label: 'Last month', order: 5 }
  }

  if (date >= thisYear) {
    return { key: 'this-year', label: 'Earlier this year', order: 6 }
  }

  return { key: 'older', label: 'Older', order: 7 }
}

function getColumnWidth(column: FileColumn) {
  return defaultColumnWidths[column] ?? 150
}

function getResponsiveColumnVisibility(
  tableColumns: readonly { id: FileColumn }[],
  automaticColumns: readonly FileColumn[],
  overrides: Record<string, boolean>,
  columnWidths: Record<string, number>,
  availableWidth: number,
) {
  const visibility = Object.fromEntries(
    tableColumns.map(({ id }) => [id, id === 'name']),
  )
  let remainingWidth =
    availableWidth - (columnWidths.name ?? minimumNameColumnWidth)

  for (const { id } of tableColumns) {
    if (id === 'name' || overrides[id] !== true) {
      continue
    }

    visibility[id] = true
    remainingWidth -= columnWidths[id] ?? getColumnWidth(id)
  }

  let automaticColumnsFit = true

  for (const id of new Set(automaticColumns)) {
    if (id === 'name' || overrides[id] !== undefined) {
      continue
    }

    const width = columnWidths[id] ?? getColumnWidth(id)
    const visible = automaticColumnsFit && remainingWidth >= width

    visibility[id] = visible

    if (visible) {
      remainingWidth -= width
    } else {
      automaticColumnsFit = false
    }
  }

  return visibility
}

/** Displays indexed folder contents or a collection. */
export default function Files({
  folder,
  collectionId,
  columns = defaultColumns,
  preferencesScope,
  reportFolderStats = true,
}: FilesProps) {
  const { pathname } = useLocation()

  const preferencesKeyParts = [
    pathname,
    collectionId ?? null,
    folder?.libraryId ?? null,
    folder?.relativePath ?? null,
  ]

  if (preferencesScope) {
    preferencesKeyParts.push(preferencesScope)
  }

  const preferencesKey = JSON.stringify(preferencesKeyParts)

  return (
    <FolderContents
      preferencesKey={preferencesKey}
      folder={folder}
      collectionId={collectionId}
      columns={columns}
      reportFolderStats={reportFolderStats}
    />
  )
}

function FolderContents({
  preferencesKey,
  folder,
  collectionId,
  columns = defaultColumns,
  reportFolderStats = true,
}: FilesProps & { preferencesKey: string }) {
  const api = useApi()
  const detailsPane = useDetailsPane()
  const { search: searchText } = useSearch()
  const { libraries, loadFailed: librariesFailed } = useLibraries()
  const { values: configValues } = useConfig(['user.dateformat'])
  const dateFormat = configValues?.['user.dateformat'] ?? 'relative'

  const libraryRoots = useMemo(
    () => new Map(libraries.map((library) => [library.id, library.rootPath])),
    [libraries],
  )

  const libraryId = folder?.libraryId
  const relativePath = folder?.relativePath
  const search = folder ? searchText.trim() || undefined : undefined

  const {
    columnVisibility,
    columnSizing,
    sorting,
    viewMode,
    cardSize,
    groupBy,
    flatten,
    setPreferences,
  } = useTablePrefs(preferencesKey)

  const [viewError, setViewError] = useState('')
  const [tableWidth, setTableWidth] = useState(0)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [tableElement, setTableElement] = useState<HTMLTableElement | null>(
    null,
  )
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState(
    () => new Set<string>(),
  )

  const colset = new Set([
    'name' as const,
    ...(columns.length ? columns : defaultColumns),
    ...(['kind', 'mimeType', 'relativePath', 'createdAt'] as const),
  ])
  const tableColumns = useMemo(
    () =>
      [...colset].map((column) => ({
        id: column,
        size: getColumnWidth(column),
        minSize: column === 'name' ? minimumNameColumnWidth : 80,
        maxSize: 600,
        accessorFn: (entry: Listing['entries'][number]) => {
          if (column === 'relativePath') {
            const root = libraryRoots.get(entry.libraryId)

            return root === undefined
              ? '—'
              : formatFullPath(root, entry.relativePath)
          }

          const value = entry[column]

          return Array.isArray(value) ? value.join(', ') : value
        },
        header: fileColumnLabels[column],
      })),
    [libraryRoots, colset],
  )

  const request = useCallback(
    () =>
      collectionId
        ? api.collections.listEntries(collectionId)
        : libraryId !== undefined && relativePath !== undefined
          ? api.entries.listChildren({
              libraryId,
              relativePath,
              recursive: flatten,
              ...(search ? { search } : {}),
            })
          : Promise.reject(new Error('Missing file source')),
    [api, libraryId, relativePath, collectionId, flatten, search],
  )

  const queryKey = useMemo(
    () =>
      queryKeys.files({
        collectionId,
        libraryId,
        relativePath,
        flatten,
        search,
      }),
    [collectionId, libraryId, relativePath, flatten, search],
  )

  const {
    data: listing,
    loadFailed,
    refresh,
  } = useApiQuery<Listing | null>(queryKey, request, null)

  useEffect(() => {
    if (!folder || !listing || listing.scanned) {
      return
    }

    const interval = window.setInterval(refresh, 1000)

    return () => window.clearInterval(interval)
  }, [folder, listing, refresh])

  useLayoutEffect(() => {
    if (viewMode !== 'list') {
      return
    }

    const container = tableContainerRef.current

    if (!container || !tableElement) {
      return
    }

    const updateTableSize = () => {
      setTableWidth(container.clientWidth)
      tableElement.style.setProperty(
        '--files-table-height',
        `${tableElement.offsetHeight}px`,
      )
    }
    const observer = new ResizeObserver(updateTableSize)

    updateTableSize()
    observer.observe(container)
    observer.observe(tableElement)

    return () => observer.disconnect()
  }, [viewMode, tableElement])

  const [detailsClosing, setDetailsClosing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)

  const table = useReactTable({
    data: listing?.entries ?? emptyEntries,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility: getResponsiveColumnVisibility(
        tableColumns,
        columns,
        columnVisibility,
        columnSizing,
        tableWidth,
      ),
      columnSizing,
    },
    onColumnVisibilityChange: (update) =>
      setPreferences((current) => ({
        ...current,
        columnVisibility:
          typeof update === 'function'
            ? update(current.columnVisibility)
            : update,
      })),
    onSortingChange: (update) =>
      setPreferences((current) => ({
        ...current,
        sorting:
          typeof update === 'function' ? update(current.sorting) : update,
      })),
    onColumnSizingChange: (update) =>
      setPreferences((current) => ({
        ...current,
        columnSizing:
          typeof update === 'function' ? update(current.columnSizing) : update,
      })),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    getRowId: (entry) => String(entry.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  function viewFile(id: number) {
    setDetailsClosing(false)

    void api.collections
      .recordView(id)
      .catch(() => setViewError('Unable to update Recents.'))
  }

  const { containerRef, selectedId, selectedIds, selectFile } =
    useFileSelection({
      fileIds: table
        .getRowModel()
        .rows.filter(({ original }) => original.kind !== 'directory')
        .map(({ original }) => original.id),
      detailsHost: detailsPane.host,
      onNavigate: viewFile,
    })
  const selectedFile = listing?.entries.find((entry) => entry.id === selectedId)
  const currentFolder = listing && 'folder' in listing ? listing.folder : null
  const detailsEntry = selectedFile ?? currentFolder
  const detailsExpected =
    detailsEntry !== null || (folder !== undefined && listing === null)

  const folderStats = useMemo(() => {
    if (!folder || !listing) {
      return null
    }

    return listing.entries.reduce(
      (stats, entry) => {
        if (entry.kind === 'directory') {
          stats.folderCount += 1
        } else {
          stats.fileCount += 1
        }

        stats.totalSize += entry.size ?? 0

        return stats
      },
      {
        fileCount: 0,
        folderCount: 0,
        totalSize: 0,
        scanning: !listing.scanned,
      },
    )
  }, [folder, listing])

  usePageFolderStats(folderStats, reportFolderStats)

  const cardSizeControl = useMemo(
    () =>
      viewMode === 'list'
        ? null
        : {
            size: cardSize,
            onChange: (size: number) =>
              setPreferences((current) => ({ ...current, cardSize: size })),
          },
    [cardSize, setPreferences, viewMode],
  )

  usePageCardSizeControl(cardSizeControl, reportFolderStats)

  const visibleRows = table.getRowModel().rows
  const groupReferenceDate = new Date()
  const rowGroups = groupBy
    ? Array.from(
        visibleRows
          .reduce(
            (groups, row) => {
              const value = row.getValue(groupBy)
              const dateRange =
                value instanceof Date
                  ? getDateRangeGroup(value, groupReferenceDate)
                  : undefined
              const key = dateRange
                ? `date:${dateRange.key}`
                : (JSON.stringify(value) ?? String(value))
              const label = dateRange
                ? dateRange.label
                : groupBy === 'relativePath'
                  ? row.getValue<string>(groupBy)
                  : formatFileValue(row.original, groupBy, dateFormat)
              const group = groups.get(key)

              if (group) {
                group.rows.push(row)
              } else {
                groups.set(key, {
                  key,
                  label,
                  order: dateRange?.order,
                  rows: [row],
                })
              }

              return groups
            },
            new Map<
              string,
              {
                key: string
                label: string
                order: number | undefined
                rows: typeof visibleRows
              }
            >(),
          )
          .values(),
      ).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [{ key: 'all', label: null, order: undefined, rows: visibleRows }]

  useLayoutEffect(() => {
    detailsPane.setVisible(detailsOpen && detailsExpected)

    return () => detailsPane.setVisible(false)
  }, [detailsExpected, detailsOpen, detailsPane])

  function activateFile(id: number) {
    setDetailsOpen(true)
    selectFile(id)
    viewFile(id)
  }

  function toggleGroup(key: string) {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current)

      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }

      return next
    })
  }

  function renderFileCard(entry: Listing['entries'][number], masonry: boolean) {
    return (
      <GridCard
        as={masonry ? 'div' : 'li'}
        name={entry.name}
        isDirectory={entry.kind === 'directory'}
        highlight={search}
        selected={selectedIds.has(entry.id)}
        previewOnly={masonry}
        fileId={entry.id}
        folderPath={
          entry.kind === 'directory' && libraryRoots.has(entry.libraryId)
            ? formatFullPath(
                libraryRoots.get(entry.libraryId) ?? '',
                entry.relativePath,
              )
            : undefined
        }
        {...(entry.kind === 'directory'
          ? {
              ...folderDragProps(
                libraryRoots.has(entry.libraryId)
                  ? formatFullPath(
                      libraryRoots.get(entry.libraryId) ?? '',
                      entry.relativePath,
                    )
                  : undefined,
              ),
              to: folderUrl({
                libraryId: entry.libraryId,
                relativePath: entry.relativePath,
              }),
            }
          : {
              onClick: () => activateFile(entry.id),
              'aria-label': `Show details for ${entry.name}`,
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

  if (loadFailed) {
    return <p role="status">Unable to load files.</p>
  }

  return (
    <div ref={containerRef}>
      {viewError && <p role="alert">{viewError}</p>}

      {librariesFailed && <p role="status">Unable to load full file paths.</p>}
      <FilesToolbar
        libraryId={libraryId}
        libraryRoots={libraryRoots}
        relativePath={relativePath}
        collectionId={collectionId}
        table={table}
        viewMode={viewMode}
        groupBy={groupBy}
        flatten={flatten}
        onFlattenChange={(flatten) => {
          selectFile(null)
          setPreferences((current) => ({ ...current, flatten }))
        }}
        onGroupByChange={(groupBy) => {
          setCollapsedGroupKeys(new Set())
          setPreferences((current) => ({ ...current, groupBy }))
        }}
        onViewModeChange={(viewMode) =>
          setPreferences((current) => ({ ...current, viewMode }))
        }
      />
      {!listing ? (
        <p role="status">Loading files…</p>
      ) : viewMode !== 'list' ? (
        listing.scanned && listing.entries.length === 0 ? (
          <Surface className={styles.scroll}>
            <p role="status" className={styles.gridEmpty}>
              {search
                ? 'No matching files or folders.'
                : 'No files to display.'}
            </p>
          </Surface>
        ) : viewMode === 'masonry' ? (
          <MasonryContainer
            aria-label={collectionId ? 'Collection files' : 'Folder contents'}
            cardSize={cardSize}
            sections={rowGroups.map((group) => ({
              key: group.key,
              heading:
                group.label === null ? undefined : (
                  <div className={styles.groupHeading}>
                    <button
                      type="button"
                      className={styles.groupToggle}
                      aria-expanded={!collapsedGroupKeys.has(group.key)}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <Icon
                        className={styles.groupChevron}
                        name="chevron-right"
                        size={12}
                      />
                      {group.label}
                    </button>
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
        ) : (
          <GridContainer
            aria-label={collectionId ? 'Collection files' : 'Folder contents'}
            cardSize={cardSize}
          >
            {rowGroups.map((group) => (
              <Fragment key={group.key}>
                {group.label !== null && (
                  <li className={styles.groupHeading} data-group-heading="true">
                    <button
                      type="button"
                      className={styles.groupToggle}
                      aria-expanded={!collapsedGroupKeys.has(group.key)}
                      onClick={() => toggleGroup(group.key)}
                    >
                      <Icon
                        className={styles.groupChevron}
                        name="chevron-right"
                        size={12}
                      />
                      {group.label}
                    </button>
                  </li>
                )}
                {!collapsedGroupKeys.has(group.key) &&
                  group.rows.map(({ original: entry }) => (
                    <Fragment key={entry.id}>
                      {renderFileCard(entry, false)}
                    </Fragment>
                  ))}
              </Fragment>
            ))}
          </GridContainer>
        )
      ) : (
        <div ref={tableContainerRef} className={styles.tableContainer}>
          <Surface className={styles.scroll}>
            <table
              ref={setTableElement}
              className={styles.table}
              aria-label={collectionId ? 'Collection files' : 'Folder contents'}
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
                      colSpan={table.getVisibleLeafColumns().length}
                    >
                      {search
                        ? 'No matching files or folders.'
                        : 'No files to display.'}
                    </td>
                  </tr>
                )}
                {rowGroups.map((group) => (
                  <Fragment key={group.key}>
                    {group.label !== null && (
                      <tr className={styles.groupRow}>
                        <th colSpan={table.getVisibleLeafColumns().length}>
                          <button
                            type="button"
                            className={styles.groupToggle}
                            aria-expanded={!collapsedGroupKeys.has(group.key)}
                            onClick={() => toggleGroup(group.key)}
                          >
                            <Icon
                              className={styles.groupChevron}
                              name="chevron-right"
                              size={12}
                            />
                            {group.label}
                          </button>
                        </th>
                      </tr>
                    )}
                    {!collapsedGroupKeys.has(group.key) &&
                      group.rows.map((row) => {
                        const entry = row.original
                        const entryPath =
                          entry.kind === 'directory' &&
                          libraryRoots.has(entry.libraryId)
                            ? formatFullPath(
                                libraryRoots.get(entry.libraryId) ?? '',
                                entry.relativePath,
                              )
                            : undefined

                        return (
                          <tr
                            key={entry.id}
                            className={styles.row}
                            data-selected={selectedIds.has(entry.id)}
                            data-file-id={entry.id}
                            data-folder-drag-preview={
                              entryPath ? true : undefined
                            }
                          >
                            {row.getVisibleCells().map((cell) => {
                              const column = cell.column.id as FileColumn

                              return (
                                <td
                                  key={column}
                                  data-column={column}
                                  className={
                                    column === 'name'
                                      ? styles.nameCell
                                      : undefined
                                  }
                                  title={formatFileValueTitle(
                                    entry,
                                    column,
                                    dateFormat,
                                  )}
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
                                          onClick={() => {
                                            activateFile(entry.id)
                                          }}
                                          aria-label={`Show details for ${entry.name}`}
                                          aria-expanded={
                                            selectedId === entry.id
                                          }
                                        >
                                          <FileName
                                            name={entry.name}
                                            highlight={search}
                                          />
                                        </button>
                                      )}
                                    </span>
                                  ) : column === 'relativePath' ? (
                                    <span
                                      data-value-color={colorForFileValue(
                                        column,
                                        entry[column],
                                        groupReferenceDate,
                                      )}
                                    >
                                      {cell.getValue<string>()}
                                    </span>
                                  ) : (
                                    <span
                                      data-value-color={colorForFileValue(
                                        column,
                                        entry[column],
                                        groupReferenceDate,
                                      )}
                                    >
                                      {formatFileValue(
                                        entry,
                                        column,
                                        dateFormat,
                                      )}
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Surface>
        </div>
      )}
      {detailsOpen &&
        detailsEntry &&
        detailsPane.host &&
        createPortal(
          <FileDetails
            entry={detailsEntry}
            rootPath={libraryRoots.get(detailsEntry.libraryId)}
            dateFormat={dateFormat}
            closing={detailsClosing}
            onClose={() => setDetailsClosing(true)}
            onClosed={() => {
              setDetailsOpen(false)
              setDetailsClosing(false)
            }}
            onCollectionsChange={() => {
              if (collectionId) {
                refresh()
              }
            }}
          />,
          detailsPane.host,
        )}
    </div>
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

function useTablePrefs(preferencesKey: string) {
  const [preferenceState, setPreferenceState] = useState(() => ({
    key: preferencesKey,
    value: readTablePreferences(preferencesKey),
  }))

  if (preferenceState.key !== preferencesKey) {
    setPreferenceState({
      key: preferencesKey,
      value: readTablePreferences(preferencesKey),
    })
  }

  const preferences =
    preferenceState.key === preferencesKey
      ? preferenceState.value
      : readTablePreferences(preferencesKey)

  const {
    sorting,
    columnVisibility,
    columnSizing,
    viewMode,
    cardSize,
    groupBy,
    flatten,
  } = preferences

  useEffect(() => {
    writeTablePreferences(preferencesKey, preferences)
  }, [preferencesKey, preferences])

  const setPreferences: React.Dispatch<
    React.SetStateAction<typeof preferences>
  > = useCallback(
    (update) => {
      setPreferenceState((current) => {
        const currentValue =
          current.key === preferencesKey ? current.value : preferences
        const value =
          typeof update === 'function' ? update(currentValue) : update

        return { key: preferencesKey, value }
      })
    },
    [preferences, preferencesKey],
  )

  return {
    setPreferences,
    flatten,
    viewMode,
    cardSize,
    groupBy,
    sorting,
    columnVisibility,
    columnSizing,
  }
}
