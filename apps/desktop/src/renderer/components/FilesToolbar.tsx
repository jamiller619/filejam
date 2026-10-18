import { Icon, Menu, MenuSubmenu, Switch } from '@files/ui'
import type { Table } from '@tanstack/react-table'
import { css } from 'inline-css-modules'
import { useState } from 'react'
import { useConfig } from '../hooks/useConfig.js'
import { type FileColumn, fileColumnLabels } from '../utils/fileColumns.js'

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
`

type FilesToolbarProps<TData> = {
  libraryId?: number | undefined
  libraryRoots: Map<number, string>
  relativePath?: string | undefined
  collectionId?: string | undefined
  table: Table<TData>
}

export default function FilesToolbar<TData>({
  libraryId,
  libraryRoots,
  relativePath,
  collectionId,
  table,
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
                  onCheckedChange={column.toggleVisibility}
                />
              </label>
            ))}
          </MenuSubmenu>
        </Menu>
      </div>
    </>
  )
}
