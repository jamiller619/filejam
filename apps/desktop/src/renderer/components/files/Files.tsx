import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router'
import { useApi } from '../../hooks/useApi.js'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { useConfig } from '../../hooks/useConfig.js'
import { useFileSelection } from '../../hooks/useFileSelection.js'
import { useLibraries } from '../../hooks/useLibraries.js'
import { usePageCardSizeControl, usePageFolderStats } from '../../pages/Page.js'
import { queryClient, queryKeys } from '../../queryClient.js'
import {
  type FileColumn,
  fileColumnLabels,
  formatFullPath,
} from '../../utils/fileColumns.js'
import { useDetailsPane } from '../layout/DetailsPaneContext.js'
import { useSearch } from '../layout/SearchContext.js'
import FileDetails from './FileDetails.js'
import {
  defaultFileColumns,
  getColumnWidth,
  minimumNameColumnWidth,
} from './Files.constants.js'
import type { FilesProps, Listing } from './Files.types.js'
import FilesGrid from './FilesGrid.js'
import FilesTable from './FilesTable.js'
import FilesToolbar from './FilesToolbar.js'
import { groupFileRows } from './fileRowGroups.js'
import { useFilesTablePreferences } from './useFilesTablePreferences.js'

export type { FileColumn } from '../../utils/fileColumns.js'
export type { Folder } from './Files.types.js'

const emptyEntries: Listing['entries'] = []

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
  columns = defaultFileColumns,
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

  return (
    <FolderContents
      preferencesKey={JSON.stringify(preferencesKeyParts)}
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
  columns = defaultFileColumns,
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
  } = useFilesTablePreferences(preferencesKey)

  const [viewError, setViewError] = useState('')
  const [tableWidth, setTableWidth] = useState(0)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState(
    () => new Set<string>(),
  )
  const [detailsClosing, setDetailsClosing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const tableColumns = useMemo(() => {
    const columnSet = new Set([
      'name' as const,
      ...(columns.length ? columns : defaultFileColumns),
      ...(['kind', 'mimeType', 'relativePath', 'createdAt'] as const),
    ])

    return [...columnSet].map((column) => ({
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
    }))
  }, [columns, libraryRoots])
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
    [api, collectionId, flatten, libraryId, relativePath, search],
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
    [collectionId, flatten, libraryId, relativePath, search],
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
  const viewFile = useCallback(
    (id: number) => {
      setDetailsClosing(false)

      void api.collections
        .recordView(id)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['files'] })
          void queryClient.invalidateQueries({
            queryKey: queryKeys.entryCollections(id),
          })
        })
        .catch(() => setViewError('Unable to update recently opened files.'))
    },
    [api],
  )
  const visibleRows = table.getRowModel().rows
  const fileIds = useMemo(
    () =>
      visibleRows
        .filter(({ original }) => original.kind !== 'directory')
        .map(({ original }) => original.id),
    [visibleRows],
  )
  const { containerRef, selectedId, selectedIds, selectFile } =
    useFileSelection({
      fileIds,
      detailsHost: detailsPane.host,
      onNavigate: viewFile,
    })
  const selectedFile = useMemo(
    () => listing?.entries.find((entry) => entry.id === selectedId),
    [listing, selectedId],
  )
  const currentFolder = listing && 'folder' in listing ? listing.folder : null
  const detailsEntry = selectedFile ?? currentFolder
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

  const groupReferenceDate = useMemo(() => new Date(), [])
  const rowGroups = useMemo(
    () => groupFileRows(visibleRows, groupBy, dateFormat, groupReferenceDate),
    [dateFormat, groupBy, groupReferenceDate, visibleRows],
  )

  useLayoutEffect(() => {
    detailsPane.setVisible(detailsOpen)
  }, [detailsOpen, detailsPane])

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

  if (loadFailed) {
    return <p role="status">Unable to load files.</p>
  }

  const ariaLabel = collectionId ? 'Collection files' : 'Folder contents'

  return (
    <div ref={containerRef}>
      {viewError && <p role="alert">{viewError}</p>}
      {librariesFailed && <p role="status">Unable to load full file paths.</p>}
      <FilesToolbar
        libraryId={libraryId}
        libraryRoots={libraryRoots}
        relativePath={relativePath}
        collectionId={collectionId}
        detailsOpen={detailsOpen && !detailsClosing}
        table={table}
        viewMode={viewMode}
        groupBy={groupBy}
        flatten={flatten}
        onDetailsOpenChange={(open) => {
          if (open) {
            setDetailsOpen(true)
            setDetailsClosing(false)
          } else {
            setDetailsClosing(true)
          }
        }}
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
      ) : viewMode === 'list' ? (
        <FilesTable
          table={table}
          listing={listing}
          rowGroups={rowGroups}
          collapsedGroupKeys={collapsedGroupKeys}
          libraryRoots={libraryRoots}
          selectedId={selectedId}
          selectedIds={selectedIds}
          search={search}
          dateFormat={dateFormat}
          groupReferenceDate={groupReferenceDate}
          ariaLabel={ariaLabel}
          onActivateFile={activateFile}
          onToggleGroup={toggleGroup}
          onWidthChange={setTableWidth}
        />
      ) : (
        <FilesGrid
          listing={listing}
          viewMode={viewMode}
          cardSize={cardSize}
          rowGroups={rowGroups}
          collapsedGroupKeys={collapsedGroupKeys}
          libraryRoots={libraryRoots}
          selectedId={selectedId}
          selectedIds={selectedIds}
          search={search}
          ariaLabel={ariaLabel}
          onActivateFile={activateFile}
          onToggleGroup={toggleGroup}
        />
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
