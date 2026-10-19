import {
  Button,
  ButtonGroup,
  Icon,
  Menu,
  MenuSubmenu,
  Select,
  Switch,
} from '@files/ui'
import type { Table } from '@tanstack/react-table'
import { css } from 'inline-css-modules'
import { useState } from 'react'
import { useConfig } from '../hooks/useConfig.js'
import { type FileColumn, fileColumnLabels } from '../utils/fileColumns.js'
import type { FileViewMode } from '../utils/tablePreferences.js'

const styles = css`
  .toolbar {
    position: sticky;
    top: 36px;
    z-index: 2;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--suzy-space-3);
    justify-content: flex-end;
    padding-block: var(--suzy-space-2);
    padding-inline-end: calc(var(--scrollbar-size, 10px) + var(--suzy-space-2));
    background: var(--suzy-gray-2);
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
`

type FilesToolbarProps<TData> = {
  libraryId?: number | undefined
  libraryRoots: Map<number, string>
  relativePath?: string | undefined
  collectionId?: string | undefined
  viewMode: FileViewMode
  flatten: boolean
  onFlattenChange: (flatten: boolean) => void
  onViewModeChange: (viewMode: FileViewMode) => void
  table: Table<TData>
}

export default function FilesToolbar<TData>({
  libraryId,
  libraryRoots,
  relativePath,
  collectionId,
  table,
  viewMode,
  onViewModeChange,
  flatten,
  onFlattenChange,
}: FilesToolbarProps<TData>) {
  const {
    values: configValues,
    loading: configLoading,
    updateConfig,
  } = useConfig(['user.favoriteFolders'])

  const rootPath =
    libraryId === undefined ? undefined : libraryRoots.get(libraryId)

  const separator = rootPath?.includes('\\') ? '\\' : '/'

  const currentFolderPath = rootPath
    ? `${rootPath.replace(/[\\/]+$/, '')}${relativePath ? `${separator}${relativePath.replaceAll('/', separator)}` : ''}`
    : undefined

  const favoritePaths = Array.isArray(configValues?.['user.favoriteFolders'])
    ? configValues['user.favoriteFolders'].filter(
        (path): path is string => typeof path === 'string',
      )
    : []

  const [favoriteError, setFavoriteError] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)

  return (
    <>
      {favoriteError && <p role="alert">{favoriteError}</p>}
      <div className={styles.toolbar}>
        {currentFolderPath && !collectionId && (
          <div className={styles.columnSetting}>
            <span>Flatten view</span>
            <Switch
              aria-label="Flatten view"
              title="Show files from all subfolders and hide folders"
              checked={flatten}
              onCheckedChange={onFlattenChange}
            />
          </div>
        )}
        <Select
          aria-label="Sort files"
          value={
            table.getState().sorting[0]
              ? `${table.getState().sorting[0]?.id}:${table.getState().sorting[0]?.desc ? 'desc' : 'asc'}`
              : ''
          }
          onChange={(event) => {
            const [id, direction] = event.target.value.split(':')

            table.setSorting(id ? [{ id, desc: direction === 'desc' }] : [])
          }}
        >
          <option value="">Default order</option>
          {table.getAllLeafColumns().map((column) => (
            <optgroup
              key={column.id}
              label={fileColumnLabels[column.id as FileColumn]}
            >
              <option value={`${column.id}:asc`}>
                {fileColumnLabels[column.id as FileColumn]} ? ascending
              </option>
              <option value={`${column.id}:desc`}>
                {fileColumnLabels[column.id as FileColumn]} ? descending
              </option>
            </optgroup>
          ))}
        </Select>
        <ButtonGroup role="group" aria-label="File view">
          {(['list', 'grid'] as const).map((mode) => (
            <Button
              key={mode}
              className={styles.viewButton}
              aria-label={`${mode === 'list' ? 'List' : 'Grid'} view`}
              title={`${mode === 'list' ? 'List' : 'Grid'} view`}
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
            >
              <Icon name={mode} size={18} />
            </Button>
          ))}
        </ButtonGroup>
        <Menu label="More options" trigger={<Icon name="ellipsis" size={20} />}>
          {currentFolderPath && !collectionId && !configLoading && (
            <div className={styles.favoriteSetting}>
              <span>Favorite</span>
              <Switch
                aria-label="Favorite"
                checked={favoritePaths.includes(currentFolderPath)}
                disabled={favoriteBusy}
                onCheckedChange={(checked) => {
                  if (favoriteBusy) {
                    return
                  }

                  setFavoriteBusy(true)
                  setFavoriteError('')

                  const updatedPaths = checked
                    ? [...favoritePaths, currentFolderPath]
                    : favoritePaths.filter((path) => path !== currentFolderPath)

                  void updateConfig('user.favoriteFolders', updatedPaths)
                    .catch(() =>
                      setFavoriteError('Unable to update favorites.'),
                    )
                    .finally(() => setFavoriteBusy(false))
                }}
              />
            </div>
          )}
          {viewMode === 'list' && (
            <MenuSubmenu label="Columns">
              {table.getAllLeafColumns().map((column) => (
                // biome-ignore lint/a11y/noLabelWithoutControl: the switch is the input
                <label key={column.id} className={styles.columnSetting}>
                  <span>{fileColumnLabels[column.id as FileColumn]}</span>
                  <Switch
                    disabled={column.id === 'name'}
                    checked={column.getIsVisible()}
                    onCheckedChange={column.toggleVisibility}
                  />
                </label>
              ))}
            </MenuSubmenu>
          )}
        </Menu>
      </div>
    </>
  )
}
