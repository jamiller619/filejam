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
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { useConfig } from '../../hooks/useConfig.js'
import {
  type FileColumn,
  fileColumnLabels,
  formatFullPath,
} from '../../utils/fileColumns.js'
import type { FileViewMode } from '../../utils/tablePreferences.js'

const styles = css`
  .toolbar {
    position: sticky;
    top: var(--files-sticky-offset, 0px);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--suzy-space-3);
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
  .trailingControls {
    margin-inline-start: auto;
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
  .favoriteButton {
    gap: var(--suzy-space-2);
  }
  .favoriteButton[aria-pressed='true'] {
    color: var(--suzy-accent-9);
  }
  .favoriteIcon {
    position: relative;
    display: inline-flex;
    transform: scale(1);
    transition: transform 360ms cubic-bezier(0.2, 1.65, 0.4, 1);
  }
  .favoriteButton:active .favoriteIcon {
    transform: scale(0.72);
    transition-duration: 80ms;
    transition-timing-function: ease-in;
  }
  .confetti {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--suzy-accent-9);
    pointer-events: none;
    animation: favorite-confetti 480ms cubic-bezier(0.2, 0.75, 0.35, 1) both;
  }
  .confetti:nth-child(1) {
    --confetti-x: -13px;
    --confetti-y: -10px;
  }
  .confetti:nth-child(2) {
    --confetti-x: -3px;
    --confetti-y: -16px;
  }
  .confetti:nth-child(3) {
    --confetti-x: 9px;
    --confetti-y: -13px;
  }
  .confetti:nth-child(4) {
    --confetti-x: 15px;
    --confetti-y: -2px;
  }
  .confetti:nth-child(5) {
    --confetti-x: 11px;
    --confetti-y: 10px;
  }
  .confetti:nth-child(6) {
    --confetti-x: -1px;
    --confetti-y: 14px;
  }
  .confetti:nth-child(7) {
    --confetti-x: -12px;
    --confetti-y: 8px;
  }
  .favoriteLabel {
    color: #fff;
  }
  @keyframes favorite-confetti {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.4);
    }
    18% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(
          calc(-50% + var(--confetti-x)),
          calc(-50% + var(--confetti-y))
        )
        scale(0.8);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .favoriteIcon {
      transition: none;
    }
    .confetti {
      display: none;
    }
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

const confettiPieces = [
  'upper-left',
  'top',
  'upper-right',
  'right',
  'lower-right',
  'bottom',
  'lower-left',
] as const

function FavoriteSetting({ busy, isFavorite, onChange }: FavoriteSettingProps) {
  const [burstId, setBurstId] = useState(0)
  const actionLabel = isFavorite ? 'Remove from favorites' : 'Add to favorites'

  function handleClick() {
    if (!isFavorite) {
      setBurstId((currentId) => currentId + 1)
    }

    onChange(!isFavorite)
  }

  return (
    <div className={styles.menuSetting}>
      <Button
        className={styles.favoriteButton}
        variant="ghost"
        aria-label={actionLabel}
        title={actionLabel}
        aria-pressed={isFavorite}
        disabled={busy}
        onClick={handleClick}
      >
        <span className={styles.favoriteIcon}>
          <Icon name={isFavorite ? 'heart-filled' : 'heart'} size={20} />
          {burstId > 0 && (
            <span key={burstId} aria-hidden="true">
              {confettiPieces.map((piece) => (
                <span key={piece} className={styles.confetti} />
              ))}
            </span>
          )}
        </span>
        <span className={styles.favoriteLabel}>Favorite</span>
      </Button>
    </div>
  )
}

type ColumnSettingsProps<TData> = {
  table: Table<TData>
}

function ColumnSettings<TData>({ table }: ColumnSettingsProps<TData>) {
  const idPrefix = useId()

  return table.getAllLeafColumns().map((column) => {
    const switchId = `${idPrefix}-column-visibility-${column.id}`

    return (
      <label key={column.id} className={styles.menuSetting} htmlFor={switchId}>
        <span>{fileColumnLabels[column.id as FileColumn]}</span>
        <Switch
          id={switchId}
          disabled={column.id === 'name'}
          checked={column.getIsVisible()}
          onCheckedChange={column.toggleVisibility}
        />
      </label>
    )
  })
}

const viewLabels = {
  list: 'List',
  grid: 'Grid',
  masonry: 'Masonry',
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

  const currentFolderPath = rootPath
    ? formatFullPath(rootPath, relativePath ?? '')
    : undefined

  const favoritePaths = Array.isArray(configValues?.['user.favoriteFolders'])
    ? configValues['user.favoriteFolders'].filter(
        (path): path is string => typeof path === 'string',
      )
    : []

  const [favoriteError, setFavoriteError] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const flattenSwitchId = useId()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const viewControlsRef = useRef<HTMLDivElement>(null)
  const sortControlsRef = useRef<HTMLDivElement>(null)
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
    const viewControls = viewControlsRef.current
    const sortControls = sortControlsRef.current
    const primaryControls = primaryControlsRef.current
    const overflowControls = overflowControlsRef.current

    if (
      !toolbar ||
      !viewControls ||
      !sortControls ||
      !primaryControls ||
      !overflowControls
    ) {
      return
    }

    const updateOverflow = () => {
      const toolbarStyle = getComputedStyle(toolbar)
      const availableWidth =
        toolbar.clientWidth -
        Number.parseFloat(toolbarStyle.paddingInlineStart) -
        Number.parseFloat(toolbarStyle.paddingInlineEnd)
      const gap = Number.parseFloat(toolbarStyle.columnGap)
      const visibleControlGroups = hasOverflowControls ? 4 : 3
      const controlsWidth =
        viewControls.offsetWidth +
        sortControls.offsetWidth +
        primaryControls.offsetWidth +
        overflowControls.offsetWidth +
        gap * (visibleControlGroups - 1)

      setShowMore(hasOverflowControls && controlsWidth > availableWidth)
    }

    updateOverflow()

    const observer = new ResizeObserver(updateOverflow)
    observer.observe(toolbar)
    observer.observe(viewControls)
    observer.observe(sortControls)
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
        <div ref={viewControlsRef} className={styles.controlGroup}>
          <ButtonGroup role="group" aria-label="File view">
            {(['list', 'grid', 'masonry'] as const).map((mode) => (
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
        <div ref={sortControlsRef} className={styles.controlGroup}>
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
        </div>
        <div
          ref={primaryControlsRef}
          className={`${styles.controlGroup} ${styles.trailingControls}`}
        >
          {currentFolderPath && !collectionId && (
            <label className={styles.menuSetting} htmlFor={flattenSwitchId}>
              <span>Flatten view</span>
              <Switch
                id={flattenSwitchId}
                title="Show files from all subfolders and hide folders"
                checked={flatten}
                onCheckedChange={onFlattenChange}
              />
            </label>
          )}
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
            <Menu label="Columns" trigger={<Icon name="columns" size={18} />}>
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
