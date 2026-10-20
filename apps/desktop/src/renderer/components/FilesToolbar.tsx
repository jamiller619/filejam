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
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
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
    gap: var(--suzy-space-3);
    justify-content: flex-end;
    padding-block: var(--suzy-space-2);
    padding-inline-end: calc(var(--scrollbar-size, 10px) + var(--suzy-space-2));
    background: var(--suzy-gray-2);
  }
  .controlGroup {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--suzy-space-3);
  }
  .overflowedControls {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
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
  .menuSetting {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: var(--suzy-space-3);
    padding-inline: var(--suzy-space-2);
    white-space: nowrap;
  }
  /* .favoriteButton {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
  } */
  .favoriteButton[aria-pressed='true'] {
    color: var(--suzy-accent-9);
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

type ToolbarMenuProps = {
  label: string
  value: string
  children: ReactNode
}

function DropdownIcon() {
  return <Icon className={styles.dropdownIcon} name="chevron-up" size={12} />
}

function ToolbarMenu({ label, value, children }: ToolbarMenuProps) {
  return (
    <div className={styles.sortSetting}>
      <span>{label}</span>
      <Menu
        label={label}
        triggerVariant="text"
        trigger={
          <>
            {value}
            <DropdownIcon />
          </>
        }
      >
        {children}
      </Menu>
    </div>
  )
}

type FavoriteSettingProps = {
  busy: boolean
  isFavorite: boolean
  onChange: (isFavorite: boolean) => void
}

function FavoriteSetting({ busy, isFavorite, onChange }: FavoriteSettingProps) {
  const actionLabel = isFavorite ? 'Remove from favorites' : 'Add to favorites'

  return (
    <div className={styles.menuSetting}>
      <Button
        className={styles.favoriteButton}
        variant="ghost"
        aria-label={actionLabel}
        title={actionLabel}
        aria-pressed={isFavorite}
        disabled={busy}
        onClick={() => onChange(!isFavorite)}
      >
        <Icon name={isFavorite ? 'heart-filled' : 'heart'} size={20} />
      </Button>
      <span>Favorite</span>
    </div>
  )
}

type ColumnSettingsProps<TData> = {
  table: Table<TData>
}

function ColumnSettings<TData>({ table }: ColumnSettingsProps<TData>) {
  return table.getAllLeafColumns().map((column) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: the switch is the input
    <label key={column.id} className={styles.menuSetting}>
      <span>{fileColumnLabels[column.id as FileColumn]}</span>
      <Switch
        disabled={column.id === 'name'}
        checked={column.getIsVisible()}
        onCheckedChange={column.toggleVisibility}
      />
    </label>
  ))
}

const viewLabels = {
  list: 'List',
  grid: 'Grid',
} satisfies Record<FileViewMode, string>

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
  const [showMore, setShowMore] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const primaryControlsRef = useRef<HTMLDivElement>(null)
  const overflowControlsRef = useRef<HTMLDivElement>(null)
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
  const canFavorite = Boolean(
    currentFolderPath && !collectionId && !configLoading,
  )
  const isFavorite = favoritePaths.includes(currentFolderPath ?? '')
  const hasOverflowControls = canFavorite || viewMode === 'list'

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    const primaryControls = primaryControlsRef.current
    const overflowControls = overflowControlsRef.current

    if (!toolbar || !primaryControls || !overflowControls) {
      return
    }

    const updateOverflow = () => {
      const toolbarStyle = getComputedStyle(toolbar)
      const availableWidth =
        toolbar.clientWidth -
        Number.parseFloat(toolbarStyle.paddingInlineStart) -
        Number.parseFloat(toolbarStyle.paddingInlineEnd)
      const gap = Number.parseFloat(toolbarStyle.columnGap)
      const controlsWidth =
        primaryControls.offsetWidth +
        overflowControls.offsetWidth +
        (hasOverflowControls ? gap : 0)

      setShowMore(hasOverflowControls && controlsWidth > availableWidth)
    }

    updateOverflow()

    const observer = new ResizeObserver(updateOverflow)
    observer.observe(toolbar)
    observer.observe(primaryControls)
    observer.observe(overflowControls)

    return () => observer.disconnect()
  }, [hasOverflowControls])

  function updateFavorite(checked: boolean) {
    if (favoriteBusy || !currentFolderPath) {
      return
    }

    setFavoriteBusy(true)
    setFavoriteError('')

    const updatedPaths = checked
      ? [...favoritePaths, currentFolderPath]
      : favoritePaths.filter((path) => path !== currentFolderPath)

    void updateConfig('user.favoriteFolders', updatedPaths)
      .catch(() => setFavoriteError('Unable to update favorites.'))
      .finally(() => setFavoriteBusy(false))
  }

  return (
    <>
      {favoriteError && <p role="alert">{favoriteError}</p>}
      <div ref={toolbarRef} className={styles.toolbar} role="toolbar">
        <div ref={primaryControlsRef} className={styles.controlGroup}>
          {currentFolderPath && !collectionId && (
            <div className={styles.menuSetting}>
              <span>Flatten view</span>
              <Switch
                aria-label="Flatten view"
                title="Show files from all subfolders and hide folders"
                checked={flatten}
                onCheckedChange={onFlattenChange}
              />
            </div>
          )}
          <ToolbarMenu
            label="Sort by"
            value={`${currentSortLabel}${
              currentSortDirection ? ` (${currentSortDirection})` : ''
            }`}
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
          </ToolbarMenu>
          <ToolbarMenu label="Group by" value={currentGroupLabel}>
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
          </ToolbarMenu>
          <ButtonGroup role="group" aria-label="File view">
            {(['list', 'grid'] as const).map((mode) => (
              <Button
                key={mode}
                className={styles.viewButton}
                aria-label={`${viewLabels[mode]} view`}
                title={`${viewLabels[mode]} view`}
                aria-pressed={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
              >
                <Icon name={mode} size={18} />
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <div
          ref={overflowControlsRef}
          className={`${styles.controlGroup} ${showMore ? styles.overflowedControls : ''}`}
        >
          {canFavorite && (
            <FavoriteSetting
              busy={favoriteBusy}
              isFavorite={isFavorite}
              onChange={updateFavorite}
            />
          )}
          {viewMode === 'list' && (
            <Menu
              label="Columns"
              triggerVariant="text"
              trigger={
                <>
                  Columns
                  <DropdownIcon />
                </>
              }
            >
              <ColumnSettings table={table} />
            </Menu>
          )}
        </div>
        {showMore && (
          <Menu
            label="More options"
            trigger={<Icon name="ellipsis" size={20} />}
          >
            {canFavorite && (
              <FavoriteSetting
                busy={favoriteBusy}
                isFavorite={isFavorite}
                onChange={updateFavorite}
              />
            )}
            {viewMode === 'list' && (
              <MenuSubmenu label="Columns">
                <ColumnSettings table={table} />
              </MenuSubmenu>
            )}
          </Menu>
        )}
      </div>
    </>
  )
}
