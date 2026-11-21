import { type ContextMenuItem, Icon, withContextMenu } from '@filejam/ui'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  type ComponentPropsWithRef,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router'
import { useApi } from '../../hooks/useApi.js'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { useFileSelection } from '../../hooks/useFileSelection.js'
import { useLibraries } from '../../hooks/useLibraries.js'
import { useSettings } from '../../hooks/useSettings.js'
import { useToast } from '../../hooks/useToast.js'
import { usePageCardSizeControl, usePageFolderStats } from '../../pages/Page.js'
import { queryClient, queryKeys } from '../../queryClient.js'
import {
  type FileColumn,
  fileColumnLabels,
  formatFullPath,
} from '../../utils/fileColumns.js'
import { folderDragType } from '../../utils/folderDrag.js'
import { useAppearance } from '../icons/AppearanceProvider.js'
import { useDetailsPane } from '../layout/DetailsPaneContext.js'
import { useSearch } from '../layout/SearchContext.js'
import FileDetails from './FileDetails.js'
import FileOperationDialog, {
  type TransferRequest,
} from './FileOperationDialog.js'
import FileOperations from './FileOperations.js'
import {
  defaultFileColumns,
  getColumnWidth,
  minimumNameColumnWidth,
} from './Files.constants.js'
import type {
  FileClipboardKind,
  FileEntry,
  FilesProps,
  Listing,
} from './Files.types.js'
import FilesGrid from './FilesGrid.js'
import FilesTable from './FilesTable.js'
import FilesToolbar from './FilesToolbar.js'
import { groupFileRows } from './fileRowGroups.js'
import InlineRename from './InlineRename.js'
import { useFilesTablePreferences } from './useFilesTablePreferences.js'

export type { FileColumn } from '../../utils/fileColumns.js'
export type { Folder } from './Files.types.js'

const emptyEntries: Listing['entries'] = []
let fileClipboard:
  | { kind: FileClipboardKind; paths: ReadonlySet<string> }
  | undefined
const clipboardListeners = new Set<() => void>()

function subscribeToFileClipboard(listener: () => void) {
  clipboardListeners.add(listener)

  return () => {
    clipboardListeners.delete(listener)
  }
}

function getFileClipboard() {
  return fileClipboard
}

function setFileClipboard(clipboard: typeof fileClipboard) {
  fileClipboard = clipboard

  for (const listener of clipboardListeners) {
    listener()
  }
}

const FileMenuArea = withContextMenu(
  function FileMenuArea({
    items: _items,
    ...props
  }: ComponentPropsWithRef<'div'> & { items: readonly ContextMenuItem[] }) {
    return <div {...props} />
  },
  ({ items }) => items,
)

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
  path,
  folder,
  collectionId,
  columns = defaultFileColumns,
  preferencesScope,
  reportFolderStats = true,
}: FilesProps) {
  const { pathname } = useLocation()
  const preferencesKeyParts = [
    pathname,
    path ?? null,
    collectionId ?? null,
    folder?.libraryId ?? null,
    folder?.relativePath ?? null,
  ]

  if (preferencesScope) {
    preferencesKeyParts.push(preferencesScope)
  }

  return (
    <FolderContents
      key={JSON.stringify(preferencesKeyParts)}
      preferencesKey={JSON.stringify(preferencesKeyParts)}
      path={path}
      preferencesScope={preferencesScope}
      folder={folder}
      collectionId={collectionId}
      columns={columns}
      reportFolderStats={reportFolderStats}
    />
  )
}

function FolderContents({
  preferencesKey,
  preferencesScope,
  path,
  folder,
  collectionId,
  columns = defaultFileColumns,
  reportFolderStats = true,
}: FilesProps & { preferencesKey: string }) {
  const api = useApi()
  const { edit } = useAppearance()
  const [contextFileId, setContextFileId] = useState<number | null>(null)
  const detailsPane = useDetailsPane()
  const { search: searchText } = useSearch()
  const { libraries, loadFailed: librariesFailed } = useLibraries()
  const { values: settingsValues } = useSettings([
    'user.dateformat',
    'user.files.showExtensions',
    'user.files.showHidden',
    'user.files.showSystem',
  ])
  const showHidden = settingsValues?.['user.files.showHidden'] ?? false
  const showSystem = settingsValues?.['user.files.showSystem'] ?? false
  const dateFormat = settingsValues?.['user.dateformat'] ?? 'relative'
  const showFileExtensions =
    settingsValues?.['user.files.showExtensions'] ?? false
  const libraryRoots = useMemo(
    () => new Map(libraries.map((library) => [library.id, library.rootPath])),
    [libraries],
  )
  const libraryId = folder?.libraryId
  const relativePath = folder?.relativePath
  const folderView =
    relativePath === ''
      ? libraries.find((library) => library.id === libraryId)?.folderView
      : null
  const search = folder || path ? searchText.trim() || undefined : undefined
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
  const effectiveFlatten = folderView?.recursive ?? flatten

  const [viewError, setViewError] = useState('')
  const [renameEntry, setRenameEntry] = useState<{
    entry: FileEntry & { absolutePath: string }
    paths: string[]
  } | null>(null)
  const closeRename = useCallback(() => setRenameEntry(null), [])
  const [operationRequest, setOperationRequest] =
    useState<TransferRequest | null>(null)
  const { add: addToast, close: closeToast } = useToast()
  const clipboard = useSyncExternalStore(
    subscribeToFileClipboard,
    getFileClipboard,
  )
  const [tableWidth, setTableWidth] = useState(0)
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState(
    () => new Set<string>(),
  )
  const [detailsClosing, setDetailsClosing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const detailsVisibilityRequest = useRef(0)
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
        if (column === 'name') {
          return entry.presentation?.displayName ?? entry.name
        }

        if (column === 'relativePath') {
          if (entry.absolutePath) {
            return entry.absolutePath
          }
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
  const request = useCallback(() => {
    if (path) {
      return api.filesystem.list({
        path,
        showHidden,
        showSystem,
        search: search ?? '',
        recursive: effectiveFlatten,
        pane: preferencesScope === 'secondary' ? 'secondary' : 'primary',
      })
    }

    if (collectionId) {
      return api.collections.listEntries(collectionId)
    }

    if (libraryId !== undefined && relativePath !== undefined) {
      return api.entries.listChildren({
        libraryId,
        relativePath,
        recursive: effectiveFlatten,
        ...(search ? { search } : {}),
      })
    }

    return Promise.reject(new Error('Missing file source'))
  }, [
    api,
    path,
    preferencesScope,
    showHidden,
    showSystem,
    collectionId,
    effectiveFlatten,
    libraryId,
    relativePath,
    search,
  ])
  const queryKey = useMemo(
    () =>
      path
        ? [
            'files',
            'location',
            path,
            showHidden,
            showSystem,
            effectiveFlatten,
            search,
            preferencesScope,
          ]
        : queryKeys.files({
            collectionId,
            libraryId,
            relativePath,
            flatten: effectiveFlatten,
            search,
          }),
    [
      path,
      preferencesScope,
      showHidden,
      showSystem,
      collectionId,
      effectiveFlatten,
      libraryId,
      relativePath,
      search,
    ],
  )
  const {
    data: listing,
    loadFailed,
    refresh,
  } = useApiQuery<Listing | null>(queryKey, request, null, {
    enabled: !path || settingsValues !== undefined,
    staleTime: path ? 0 : 30_000,
    ...(path ? { retry: false } : {}),
  })

  useEffect(() => {
    function cancelClipboard(event: globalThis.KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        !getFileClipboard() ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }

      const target = event.target

      if (
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest(
              'input, textarea, select, [role="textbox"], [role="menu"], [role="listbox"]',
            ))) ||
        document.querySelector('dialog:modal')
      ) {
        return
      }

      event.preventDefault()
      setFileClipboard(undefined)
    }

    document.addEventListener('keydown', cancelClipboard)

    return () => document.removeEventListener('keydown', cancelClipboard)
  }, [])

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
      if (path) {
        return
      }

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
    [api, path],
  )
  const visibleRows = table.getRowModel().rows
  const groupReferenceDate = useMemo(() => new Date(), [])
  const rowGroups = useMemo(
    () => groupFileRows(visibleRows, groupBy, dateFormat, groupReferenceDate),
    [dateFormat, groupBy, groupReferenceDate, visibleRows],
  )
  const itemIds = useMemo(
    () =>
      rowGroups.flatMap((group) =>
        collapsedGroupKeys.has(group.key)
          ? []
          : group.rows.map((row) => row.original.id),
      ),
    [collapsedGroupKeys, rowGroups],
  )
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
      itemIds,
      detailsHost: detailsPane.host,
      onNavigate: viewFile,
    })
  const selectedFile = useMemo(
    () => listing?.entries.find((entry) => entry.id === selectedId),
    [listing, selectedId],
  )
  const currentFolder = listing && 'folder' in listing ? listing.folder : null
  const selectedEntries = useMemo(
    () => listing?.entries.filter((entry) => selectedIds.has(entry.id)) ?? [],
    [listing, selectedIds],
  )
  const detailsEntry = selectedFile ?? currentFolder
  const folderStats = useMemo(() => {
    if ((!folder && !path) || !listing) {
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
  }, [folder, path, listing])

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

  useLayoutEffect(() => {
    void detailsPane.setVisible(detailsOpen)
  }, [detailsOpen, detailsPane])

  function showDetails() {
    detailsVisibilityRequest.current++
    setDetailsOpen(true)
    setDetailsClosing(false)
    void detailsPane.setVisible(true)
  }

  function hideDetails() {
    const request = ++detailsVisibilityRequest.current

    setDetailsClosing(true)

    void detailsPane.setVisible(false).then(() => {
      if (request !== detailsVisibilityRequest.current) {
        return
      }

      setDetailsOpen(false)
      setDetailsClosing(false)
    })
  }

  function activateFile(id: number) {
    showDetails()
    selectFile(id)
    viewFile(id)
  }

  function openEntry(id: number) {
    const entry = listing?.entries.find((item) => item.id === id)
    if (entry?.absolutePath) {
      void api.filesystem
        .open(entry.absolutePath)
        .catch(() => setViewError('Unable to open this file.'))
      return
    }
    void api.entries
      .activate(id)
      .catch(() => setViewError('Unable to open this file.'))
  }

  function selectedPaths() {
    return selectedEntries.flatMap((entry) =>
      entry.absolutePath ? [entry.absolutePath] : [],
    )
  }

  function writeClipboard(kind: FileClipboardKind) {
    const paths = selectedPaths()

    if (paths.length) {
      setFileClipboard({ kind, paths: new Set(paths) })
    }
  }

  function clipboardKindForPath(path: string | undefined) {
    return path && clipboard?.paths.has(path) ? clipboard.kind : undefined
  }

  function paste() {
    const clipboard = getFileClipboard()

    if (path && clipboard) {
      setOperationRequest({
        kind: clipboard.kind === 'cut' ? 'move' : 'copy',
        paths: [...clipboard.paths],
        destination: path,
      })
    }
  }

  function operationKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.nativeEvent.isComposing ||
      operationRequest ||
      renameEntry ||
      !(event.target instanceof HTMLElement) ||
      event.target.isContentEditable ||
      event.target.closest('input, textarea, select, dialog, [role="textbox"]')
    ) {
      return
    }

    const key = event.key.toLowerCase()
    const modifier = event.ctrlKey || event.metaKey

    if (modifier && ['c', 'x', 'v', 'z', 'y'].includes(key)) {
      event.preventDefault()

      if (key === 'c' || key === 'x') {
        writeClipboard(key === 'c' ? 'copy' : 'cut')
      } else if (key === 'v') {
        paste()
      } else {
        const action = key === 'y' || event.shiftKey ? 'redo' : 'undo'
        void api.operations[action]().catch((error) =>
          setViewError(String(error)),
        )
      }
    } else if (!modifier && (key === 'delete' || key === 'f2')) {
      event.preventDefault()

      if (key === 'f2') {
        renameSelection()
      } else if (!event.repeat) {
        void trashSelection()
      }
    }
  }

  function renameSelection() {
    if (viewMode === 'masonry') {
      return
    }

    const entry =
      selectedEntries.find((entry) => entry.id === contextFileId) ??
      selectedEntries.find((entry) => entry.id === selectedId) ??
      selectedEntries[0]

    if (entry?.absolutePath) {
      setRenameEntry({
        entry: { ...entry, absolutePath: entry.absolutePath },
        paths: selectedPaths(),
      })
    }
  }

  async function trashSelection() {
    const paths = selectedPaths()

    if (!paths.length) {
      return
    }

    try {
      const result = await api.operations.trash(paths)
      const {
        id,
        completedCount,
        undoAvailable,
        error,
        undoUnavailableReason,
      } = result

      if (completedCount === 0) {
        throw new Error(error ?? 'No items were moved to Trash.')
      }

      addToast({
        id,
        title: `${completedCount} ${completedCount === 1 ? 'item' : 'items'} moved to Trash`,
        description: [error, undoUnavailableReason].filter(Boolean).join(' '),
        timeout: 4000,
        ...(undoAvailable && {
          actionProps: {
            children: 'Undo',
            onClick: () => {
              closeToast(id)
              void api.operations.undo(id).catch((error) => {
                addToast({
                  title: 'Unable to restore items',
                  description: String(error),
                  priority: 'high',
                })
              })
            },
          },
        }),
      })
    } catch (error) {
      addToast({
        title: 'Unable to move items to Trash',
        description: String(error),
        priority: 'high',
      })
    }
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
    return (
      <div role="status">
        Unable to load files.{' '}
        <button type="button" onClick={refresh}>
          Retry
        </button>
      </div>
    )
  }

  const ariaLabel = collectionId ? 'Collection files' : 'Folder contents'
  const contextFile =
    contextFileId === null
      ? undefined
      : listing?.entries.find((entry) => entry.id === contextFileId)
  const multipleSelected = selectedIds.size > 1
  const contextItems: ContextMenuItem[] = contextFile
    ? [
        {
          label: 'Copy',
          icon: <Icon name="copy" size={16} />,
          disabled: !contextFile.absolutePath,
          onClick: () => writeClipboard('copy'),
        },
        {
          label: 'Cut',
          icon: <Icon name="cut" size={16} />,
          disabled: !contextFile.absolutePath,
          onClick: () => writeClipboard('cut'),
        },
        {
          label: 'Paste here…',
          icon: <Icon name="paste" size={16} />,
          disabled: !path || !clipboard,
          onClick: paste,
        },
        {
          label: 'Rename',
          icon: <Icon name="rename" size={16} />,
          disabled: !contextFile.absolutePath || viewMode === 'masonry',
          onClick: renameSelection,
        },
        {
          label: 'Move to trash',
          icon: <Icon name="trash" size={16} />,
          disabled: !contextFile.absolutePath,
          onClick: () => void trashSelection(),
        },
        { type: 'divider', id: 'appearance' },
        {
          label: 'Change icon…',
          disabled: multipleSelected || !!contextFile.absolutePath,
          onClick: () =>
            edit(
              {
                kind: 'entry',
                libraryId: contextFile.libraryId,
                relativePath: contextFile.relativePath,
              },
              contextFile.name,
            ),
        },
      ]
    : [
        { label: 'Refresh', onClick: refresh },
        {
          label: 'Paste here…',
          icon: <Icon name="paste" size={16} />,
          disabled: !path || !clipboard,
          onClick: paste,
        },
      ]

  return (
    <section
      ref={containerRef}
      aria-label="File browser"
      data-filesystem-path={path}
      data-files-ready={!!listing}
      onKeyDown={operationKeyDown}
    >
      <FileOperations />
      {renameEntry && (
        <InlineRename
          key={renameEntry.entry.absolutePath}
          entry={renameEntry.entry}
          paths={renameEntry.paths}
          container={containerRef.current}
          onClose={closeRename}
          onRenamed={() => {
            setRenameEntry((current) =>
              current?.entry.absolutePath === renameEntry.entry.absolutePath
                ? null
                : current,
            )
            refresh()
          }}
        />
      )}
      {operationRequest && (
        <FileOperationDialog
          request={operationRequest}
          onClose={() => setOperationRequest(null)}
          onError={setViewError}
        />
      )}
      {viewError && <p role="alert">{viewError}</p>}
      {librariesFailed && <p role="status">Unable to load full file paths.</p>}
      <FilesToolbar
        path={path}
        onRefresh={refresh}
        libraryId={libraryId}
        libraryRoots={libraryRoots}
        relativePath={relativePath}
        collectionId={collectionId}
        detailsOpen={detailsOpen && !detailsClosing}
        table={table}
        viewMode={viewMode}
        groupBy={groupBy}
        flatten={effectiveFlatten}
        flattenLocked={folderView?.allowFlattenToggle === false}
        onDetailsOpenChange={(open) => {
          if (open) {
            showDetails()
          } else {
            hideDetails()
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
      {!listing && <p role="status">Loading files…</p>}
      <FileMenuArea
        items={contextItems}
        onDragStart={(event) => {
          const row =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-file-id]')
              : null
          const entry = listing?.entries.find(
            (entry) => entry.id === Number(row?.dataset.fileId),
          )

          if (!entry?.absolutePath) {
            return
          }

          const paths = selectedIds.has(entry.id)
            ? selectedPaths()
            : [entry.absolutePath]
          event.dataTransfer.effectAllowed = 'copyMove'
          event.dataTransfer.setData(folderDragType, JSON.stringify(paths))
        }}
        onClickCapture={(event) => {
          const row =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-file-id]')
              : null

          if (!row || !event.currentTarget.contains(row)) {
            if (
              event.target instanceof Element &&
              event.currentTarget.contains(event.target) &&
              !event.target.closest('button, a, input, textarea, select') &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              selectFile(null)
            }

            return
          }

          const id = Number(row.dataset.fileId)
          const modified = event.shiftKey || event.ctrlKey || event.metaKey
          const deselecting = event.detail > 0 && selectedIds.has(id)

          if (modified || deselecting) {
            // Handle selection here without also activating the item.
            event.preventDefault()
            event.stopPropagation()
          }

          selectFile(id, event)
        }}
        onContextMenuCapture={(event) => {
          const target = event.target
          const row =
            target instanceof Element
              ? target.closest<HTMLElement>('[data-file-id]')
              : null
          const id = row ? Number(row.dataset.fileId) : null

          setContextFileId(id)

          if (id !== null && !selectedIds.has(id)) {
            selectFile(id)
          }
        }}
      >
        {listing && viewMode === 'list' && (
          <FilesTable
            table={table}
            listing={listing}
            rowGroups={rowGroups}
            collapsedGroupKeys={collapsedGroupKeys}
            libraryRoots={libraryRoots}
            selectedId={selectedId}
            selectedIds={selectedIds}
            clipboardKindForPath={clipboardKindForPath}
            search={search}
            dateFormat={dateFormat}
            showFileExtensions={showFileExtensions}
            groupReferenceDate={groupReferenceDate}
            ariaLabel={ariaLabel}
            onActivateFile={activateFile}
            onOpenEntry={openEntry}
            onToggleGroup={toggleGroup}
            onWidthChange={setTableWidth}
          />
        )}
        {listing && viewMode !== 'list' && (
          <FilesGrid
            listing={listing}
            viewMode={viewMode}
            cardSize={cardSize}
            rowGroups={rowGroups}
            collapsedGroupKeys={collapsedGroupKeys}
            libraryRoots={libraryRoots}
            selectedId={selectedId}
            selectedIds={selectedIds}
            clipboardKindForPath={clipboardKindForPath}
            search={search}
            showFileExtensions={showFileExtensions}
            ariaLabel={ariaLabel}
            onActivateFile={activateFile}
            onOpenEntry={openEntry}
            onToggleGroup={toggleGroup}
          />
        )}
      </FileMenuArea>
      {detailsOpen &&
        detailsEntry &&
        detailsPane.host &&
        createPortal(
          <FileDetails
            entry={detailsEntry}
            selectedEntries={selectedEntries}
            libraryRoots={libraryRoots}
            dateFormat={dateFormat}
            closing={detailsClosing}
            onClose={hideDetails}
            onCollectionsChange={() => {
              if (collectionId) {
                refresh()
              }
            }}
          />,
          detailsPane.host,
        )}
    </section>
  )
}
