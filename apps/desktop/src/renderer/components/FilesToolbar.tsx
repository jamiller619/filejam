import {
  Button,
  ButtonGroup,
  Icon,
  Menu,
  MenuItem,
  MenuSubmenu,
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
  .sortSetting {
    display: flex;
    align-items: center;
    gap: var(--suzy-space-2);
    white-space: nowrap;
  }
  .dropdownIcon {
    margin-inline-start: var(--suzy-space-1);
    transform: rotate(180deg);
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
  groupBy: FileColumn | null
  flatten: boolean
  onFlattenChange: (flatten: boolean) => void
  onGroupByChange: (groupBy: FileColumn | null) => void
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
  groupBy,
  onGroupByChange,
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
  const currentSort = table.getState().sorting[0]
  const currentSortLabel = currentSort
    ? fileColumnLabels[currentSort.id as FileColumn]
    : 'Default order'
  const currentSortDirection = currentSort
    ? currentSort.desc
      ? 'descending'
      : 'ascending'
    : undefined
  const currentGroupLabel = groupBy ? fileColumnLabels[groupBy] : 'None'

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
        <div className={styles.sortSetting}>
          <span>Sort by</span>
          <Menu
            label="Sort by"
            triggerVariant="text"
            trigger={
              <>
                {currentSortLabel}
                {currentSortDirection ? ` (${currentSortDirection})` : ''}
                <Icon
                  className={styles.dropdownIcon}
                  name="chevron-up"
                  size={12}
                />
              </>
            }
          >
            <MenuItem
              selected={!currentSort}
              onClick={() => table.setSorting([])}
            >
              Default order
            </MenuItem>
            {table.getAllLeafColumns().map((column) => (
              <MenuItem
                key={column.id}
                selected={currentSort?.id === column.id}
                onClick={() => {
                  const isCurrentSort = currentSort?.id === column.id

                  table.setSorting([
                    {
                      id: column.id,
                      desc: isCurrentSort ? !currentSort.desc : false,
                    },
                  ])
                }}
              >
                {fileColumnLabels[column.id as FileColumn]}
                {currentSort?.id === column.id
                  ? ` (${currentSortDirection})`
                  : ''}
              </MenuItem>
            ))}
          </Menu>
        </div>
        <div className={styles.sortSetting}>
          <span>Group by</span>
          <Menu
            label="Group by"
            triggerVariant="text"
            trigger={
              <>
                {currentGroupLabel}
                <Icon
                  className={styles.dropdownIcon}
                  name="chevron-up"
                  size={12}
                />
              </>
            }
          >
            <MenuItem selected={!groupBy} onClick={() => onGroupByChange(null)}>
              None
            </MenuItem>
            {table.getAllLeafColumns().map((column) => (
              <MenuItem
                key={column.id}
                selected={groupBy === column.id}
                onClick={() => onGroupByChange(column.id as FileColumn)}
              >
                {fileColumnLabels[column.id as FileColumn]}
              </MenuItem>
            ))}
          </Menu>
        </div>
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
