import {
  Icon,
  Menu,
  MenuSubmenu,
  Surface,
  Switch,
} from '@files/ui'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { css } from 'inline-css-modules'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useApi } from '../hooks/useApi.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { useConfig } from '../hooks/useConfig.js'
import { useLibraries } from '../hooks/useLibraries.js'
import {
  type FileColumn,
  fileColumnLabels,
  formatFileValue,
  formatFileValueTitle,
  formatFullPath,
} from '../utils/fileColumns.js'
import { folderUrl } from '../utils/folderUrl.js'
import {
  readTablePreferences,
  writeTablePreferences,
} from '../utils/tablePreferences.js'
import { useDetailsPane } from './DetailsPaneContext.js'
import FileDetails from './FileDetails.js'
import FilePreview from './FilePreview.js'
import FileTags from './FileTags.js'

export type { FileColumn } from '../utils/fileColumns.js'

const emptyEntries: Listing['entries'] = []

const defaultColumns: readonly FileColumn[] = [
  'name',
  'modifiedAt',
  'size',
  'tags',
]

export type Folder = Parameters<Window['files']['entries']['listChildren']>[0]
type Listing = Awaited<ReturnType<Window['files']['entries']['listChildren']>>

export type FilesProps = {
  folder?: Folder | undefined
  collectionId?: string | undefined
  columns?: readonly FileColumn[]
}

const styles = css`
  .toolbar {
    display: flex;
    justify-content: flex-end;
    padding-inline-end: calc(var(--scrollbar-size, 10px) + var(--suzy-space-2));
  }
  .columnSetting {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: var(--suzy-space-3);
    padding-inline: var(--suzy-space-2);
    white-space: nowrap;
  }
  .favoriteSetting {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: var(--suzy-space-3);
    padding-inline: var(--suzy-space-2);
    white-space: nowrap;
  }
  .scroll {
    margin-inline: calc(0px - var(--suzy-space-2));
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
  .table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    text-align: left;

    th, td {
      vertical-align: middle;
    }

    .emptyState {
      padding: var(--suzy-space-6) var(--suzy-space-3);
      text-align: center;
      font-size: 1.125em;
    }

    th {
      font-weight: 400;
      white-space: nowrap;
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--suzy-surface);
    }
    .file {
      display: flex;
      min-width: 0;
      width: 100%;
      align-items: center;
      gap: var(--suzy-space-2);
    }
    .sort {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .row {
      position: relative;
      > td {
        background: var(--suzy-gray-3);
      }
      /* &:nth-child(even) > td {
        background: color-mix(in srgb, var(--suzy-gray-2), var(--suzy-gray-3));
      } */
      &:hover > td, &:focus-within > td {
        background: var(--suzy-gray-4);
      }
      &[data-selected='true'] > td {
        background: var(--suzy-accent-6);
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
      text-overflow: ellipsis;
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
    }
  }
  .tags {
    button, form {
      position: relative;
      z-index: 1;
    }
  }
  .nameCell {
    width: 100%;
    max-width: 0;
  }
`

/** Displays the indexed immediate children of a library folder. */
export default function Files({
  folder,
  collectionId,
  columns = defaultColumns,
}: FilesProps) {
  const { pathname } = useLocation()
  const preferencesKey = JSON.stringify([
    pathname,
    collectionId ?? null,
    folder?.libraryId ?? null,
    folder?.relativePath ?? null,
  ])
  // Remount the request state when the folder changes, hiding stale results.
  return (
    <FolderContents
      key={preferencesKey}
      preferencesKey={preferencesKey}
      folder={folder}
      collectionId={collectionId}
      columns={columns}
    />
  )
}

function FolderContents({
  preferencesKey,
  folder,
  collectionId,
  columns = defaultColumns,
}: FilesProps & { preferencesKey: string }) {
  const api = useApi()
  const detailsPane = useDetailsPane()
  const { libraries, loadFailed: librariesFailed } = useLibraries()
  const { values: configValues, loading: configLoading, updateConfig } = useConfig(['user.favoriteFolders'])
  const libraryRoots = useMemo(
    () => new Map(libraries.map((library) => [library.id, library.rootPath])),
    [libraries],
  )
  const libraryId = folder?.libraryId
  const relativePath = folder?.relativePath
  const rootPath = libraryId === undefined ? undefined : libraryRoots.get(libraryId)
  const separator = rootPath?.includes('\\') ? '\\' : '/'
  const currentFolderPath = rootPath
    ? `${rootPath.replace(/[\\/]+$/, '')}${relativePath ? `${separator}${relativePath.replaceAll('/', separator)}` : ''}`
    : undefined
  const favoritePaths = Array.isArray(configValues?.['user.favoriteFolders'])
    ? configValues['user.favoriteFolders'].filter((path): path is string => typeof path === 'string')
    : []
  const [preferences, setPreferences] = useState(() =>
    readTablePreferences(preferencesKey),
  )

  const { sorting, columnVisibility } = preferences
  useEffect(() => {
    writeTablePreferences(preferencesKey, preferences)
  }, [preferencesKey, preferences])

  const [viewError, setViewError] = useState('')
  const [favoriteError, setFavoriteError] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const tableColumns = useMemo(
    () =>
      [
        ...new Set([
          'name' as const,
          ...(columns.length ? columns : defaultColumns),
          ...(['tags', 'kind', 'mimeType', 'relativePath'] as const),
        ]),
      ].map((column) => ({
        id: column,
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
    [columns, libraryRoots],
  )

  const request = useCallback(
    () =>
      collectionId
        ? api.collections.listEntries(collectionId)
        : libraryId !== undefined && relativePath !== undefined
          ? api.entries.listChildren({ libraryId, relativePath })
          : Promise.reject(new Error('Missing file source')),
    [api, libraryId, relativePath, collectionId],
  )

  const {
    data: listing,
    setData: setListing,
    loadFailed,
    refresh,
  } = useApiQuery<Listing | null>(request, null)

  useEffect(() => {
    if (!folder || !listing || listing.scanned) return
    const interval = window.setInterval(refresh, 1000)
    return () => window.clearInterval(interval)
  }, [folder, listing, refresh])

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailsClosing, setDetailsClosing] = useState(false)
  const selectedFile = listing?.entries.find((entry) => entry.id === selectedId)

  useEffect(() => {
    detailsPane.setVisible(selectedFile !== undefined)
    return () => detailsPane.setVisible(false)
  }, [detailsPane, selectedFile])

  const table = useReactTable({
    data: listing?.entries ?? emptyEntries,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility: Object.fromEntries(
        tableColumns.map((column) => [
          column.id,
          column.id === 'name' ||
          (columnVisibility[column.id] ?? columns.includes(column.id)),
        ]),
      ),
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
    getRowId: (entry) => String(entry.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (loadFailed) return <p role="status">Unable to load files.</p>
  if (!listing) return <p role="status">Loading files…</p>

  return (
    <div>
      {viewError && <p role="alert">{viewError}</p>}
      {favoriteError && <p role="alert">{favoriteError}</p>}
      {librariesFailed && <p role="status">Unable to load full file paths.</p>}
      <div className={styles.toolbar}>
        <Menu label="More options" trigger={<Icon name="ellipsis" size={20} />}>
          {currentFolderPath && !collectionId && !configLoading && (
            <div className={styles.favoriteSetting}>
              <span>Favorite</span>
              <Switch
                aria-label="Favorite"
                checked={favoritePaths.includes(currentFolderPath)}
                disabled={favoriteBusy}
                onCheckedChange={(checked) => {
                  if (favoriteBusy) return
                  setFavoriteBusy(true)
                  setFavoriteError('')
                  const updatedPaths = checked
                    ? [...favoritePaths, currentFolderPath]
                    : favoritePaths.filter((path) => path !== currentFolderPath)
                  void updateConfig('user.favoriteFolders', updatedPaths)
                    .catch(() => setFavoriteError('Unable to update favorites.'))
                    .finally(() => setFavoriteBusy(false))
                }}
              />
            </div>
          )}
          <MenuSubmenu label="Columns">
            {table.getAllLeafColumns().map((column) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: the switch is the input
              <label key={column.id} className={styles.columnSetting}>
                <span>{fileColumnLabels[column.id as FileColumn]}</span>
                <Switch
                  disabled={column.id === 'name'}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) =>
                    column.toggleVisibility(checked)
                  }
                />
              </label>
            ))}
          </MenuSubmenu>
        </Menu>
      </div>
      {!listing.scanned && (
        <p role="status">
          This folder has not finished scanning. Files may be missing.
        </p>
      )}
      <Surface className={styles.scroll}>
        <table
          className={styles.table}
          aria-label={collectionId ? 'Collection files' : 'Folder contents'}
        >
          <thead>
            <tr>
              {(table.getHeaderGroups()[0]?.headers ?? []).map((header) => (
                <th
                  key={header.id}
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
                  No files to display.
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => {
              const entry = row.original
              return (
                <tr
                  key={entry.id}
                  className={styles.row}
                  data-selected={entry.id === selectedId}
                >
                  {row.getVisibleCells().map((cell) => {
                    const column = cell.column.id as FileColumn
                    return (
                      <td
                        key={column}
                        className={
                          column === 'name'
                            ? styles.nameCell
                            : column === 'tags'
                              ? styles.tags
                              : undefined
                        }
                        title={
                          column === 'tags'
                            ? (entry.tagReadError ?? undefined)
                            : formatFileValueTitle(entry, column)
                        }
                      >
                        {column === 'tags' ? (
                          <FileTags
                            entry={entry}
                            onChange={(updated) =>
                              setListing((current) =>
                                current
                                  ? {
                                    ...current,
                                    entries: current.entries.map((file) =>
                                      file.id === updated.id ? updated : file,
                                    ),
                                  }
                                  : current,
                              )
                            }
                          />
                        ) : column === 'name' ? (
                          <span className={styles.file}>
                            <FilePreview entry={entry} />
                            {entry.kind === 'directory' ? (
                              <Link
                                className={styles.name}
                                title={entry.name}
                                to={folderUrl({
                                  libraryId: entry.libraryId,
                                  relativePath: entry.relativePath,
                                })}
                              >
                                {entry.name}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className={styles.name}
                                title={entry.name}
                                onClick={() => {
                                  if (selectedId === entry.id) {
                                    setDetailsClosing(true)
                                    return
                                  }
                                  setDetailsClosing(false)
                                  setSelectedId(entry.id)
                                  void api.collections
                                    .recordView(entry.id)
                                    .catch(() =>
                                      setViewError('Unable to update Recents.'),
                                    )
                                }}
                                aria-label={`Show details for ${entry.name}`}
                                aria-expanded={selectedId === entry.id}
                              >
                                {entry.name}
                              </button>
                            )}
                          </span>
                        ) : column === 'relativePath' ? (
                          cell.getValue<string>()
                        ) : (
                          formatFileValue(entry, column)
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Surface>
      {selectedFile &&
        detailsPane.host &&
        createPortal(
          <FileDetails
            entry={selectedFile}
            rootPath={libraryRoots.get(selectedFile.libraryId)}
            closing={detailsClosing}
            onClose={() => setDetailsClosing(true)}
            onClosed={() => {
              setSelectedId(null)
              setDetailsClosing(false)
            }}
            onCollectionsChange={() => {
              if (collectionId) refresh()
            }}
          />,
          detailsPane.host,
        )}
    </div>
  )
}
