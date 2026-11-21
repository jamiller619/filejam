import {
  Button,
  ButtonGroup,
  Icon,
  Menu,
  OverflowToolbar,
  Select,
  Switch,
} from '@filejam/ui'
import type { Table } from '@tanstack/react-table'
import { css } from 'inline-css-modules'
import { useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useSettings } from '../../hooks/useSettings.js'
import {
  type FileColumn,
  fileColumnLabels,
  formatFullPath,
} from '../../utils/fileColumns.js'
import {
  folderUrl,
  locationBreadcrumbs,
  locationUrl,
} from '../../utils/folderUrl.js'
import type { FileViewMode } from '../../utils/tablePreferences.js'
import { IconButton } from '../icons/ItemIcon.js'

const toolbarIconSize = 20

const styles = css`
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--suzy-space-2);
    background: var(--suzy-gray-2);
    padding-block-end: var(--suzy-space-2);
  }
  .controlGroup {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--suzy-space-3);
  }
  .menuSetting {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: var(--suzy-space-2);
    white-space: nowrap;
  }
  .favoriteButton {
    gap: var(--suzy-space-2);
  }
  .favoriteButton[aria-pressed='true'] {
    color: var(--suzy-accent-9);
  }
  .detailsButton[aria-pressed='true'] {
    background: var(--suzy-gray-6);
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
  path?: string | undefined
  onRefresh: () => void
  libraryId?: number | undefined
  libraryRoots: Map<number, string>
  relativePath?: string | undefined
  collectionId?: string | undefined
  detailsOpen: boolean
  viewMode: FileViewMode
  groupBy: FileColumn | null
  flatten: boolean
  flattenLocked?: boolean | undefined
  onDetailsOpenChange: (open: boolean) => void
  onFlattenChange: (flatten: boolean) => void
  onGroupByChange: (groupBy: FileColumn | null) => void
  onViewModeChange: (viewMode: FileViewMode) => void
  table: Table<TData>
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
          <Icon
            name={isFavorite ? 'heartFilled' : 'heart'}
            size={toolbarIconSize}
          />
          {burstId > 0 && (
            <span key={burstId} aria-hidden="true">
              {confettiPieces.map((piece) => (
                <span key={piece} className={styles.confetti} />
              ))}
            </span>
          )}
        </span>
        {/* <span className={styles.favoriteLabel}>Favorite</span> */}
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
  path,
  onRefresh,
  libraryId,
  libraryRoots,
  relativePath,
  collectionId,
  detailsOpen,
  table,
  viewMode,
  groupBy,
  onGroupByChange,
  onViewModeChange,
  flatten,
  flattenLocked = false,
  onDetailsOpenChange,
  onFlattenChange,
}: FilesToolbarProps<TData>) {
  const {
    values: settingsValues,
    loading: settingsLoading,
    updateSettings,
  } = useSettings(['user.favoriteFolders'])

  const navigate = useNavigate()
  const location = useLocation()
  const navigation = window.navigation
  const canGoBack = navigation?.currentEntry
    ? navigation.canGoBack
    : location.key !== 'default' && window.history.state?.idx > 0
  const canGoForward = navigation?.currentEntry
    ? navigation.canGoForward
    : window.history.state?.idx < window.history.length - 1
  let parentUrl: string | undefined

  if (path) {
    const parent = locationBreadcrumbs(path).at(-2)

    if (parent) {
      parentUrl = locationUrl(parent.path)
    }
  } else if (!collectionId && libraryId !== undefined && relativePath) {
    parentUrl = folderUrl({
      libraryId,
      relativePath: relativePath.split('/').slice(0, -1).join('/'),
    })
  }

  const rootPath =
    libraryId === undefined ? undefined : libraryRoots.get(libraryId)

  const currentFolderPath =
    path ??
    (rootPath ? formatFullPath(rootPath, relativePath ?? '') : undefined)

  const favoritePaths = Array.isArray(settingsValues?.['user.favoriteFolders'])
    ? settingsValues['user.favoriteFolders'].filter(
      (path): path is string => typeof path === 'string',
    )
    : []

  const [favoriteError, setFavoriteError] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const flattenSwitchId = useId()
  const fileExtensionsSwitchId = useId()
  const currentSort = table.getState().sorting[0]
  const currentSortLabel = currentSort
    ? fileColumnLabels[currentSort.id as FileColumn]
    : 'Default order'
  let currentSortDirection: string | undefined

  if (currentSort) {
    currentSortDirection = currentSort.desc ? 'descending' : 'ascending'
  }

  const currentGroupLabel = groupBy ? fileColumnLabels[groupBy] : 'None'
  const canFavorite = Boolean(
    currentFolderPath && !collectionId && !settingsLoading,
  )
  const isFavorite = favoritePaths.includes(currentFolderPath ?? '')

  function updateFavorite(checked: boolean) {
    if (favoriteBusy || !currentFolderPath) {
      return
    }

    setFavoriteBusy(true)
    setFavoriteError('')

    const updatedPaths = checked
      ? [...favoritePaths, currentFolderPath]
      : favoritePaths.filter((path) => path !== currentFolderPath)

    void updateSettings('user.favoriteFolders', updatedPaths)
      .catch(() => setFavoriteError('Unable to update favorites.'))
      .finally(() => setFavoriteBusy(false))
  }

  return (
    <>
      {favoriteError && <p role="alert">{favoriteError}</p>}
      <OverflowToolbar
        className={styles.toolbar}
        trailingFrom={
          collectionId ||
            (libraryId !== undefined && relativePath !== undefined)
            ? 5
            : 4
        }
      >
        <ButtonGroup key="navigation" role="group" aria-label="File navigation">
          <Button
            aria-label="Back"
            title="Back"
            disabled={!canGoBack}
            onClick={() => navigate(-1)}
          >
            <Icon name="back" size={toolbarIconSize} />
          </Button>
          <Button
            aria-label="Up"
            title="Up to parent folder"
            disabled={!parentUrl}
            onClick={() => {
              if (parentUrl) {
                void navigate(parentUrl, { viewTransition: true })
              }
            }}
          >
            <Icon name="up" size={toolbarIconSize} />
          </Button>
          <Button
            aria-label="Refresh folder"
            title="Refresh"
            onClick={onRefresh}
          >
            <Icon name="refresh" size={toolbarIconSize} />
          </Button>
          <Button
            aria-label="Forward"
            title="Forward"
            disabled={!canGoForward}
            onClick={() => navigate(1)}
          >
            <Icon name="forward" size={toolbarIconSize} />
          </Button>
        </ButtonGroup>
        {!!collectionId && (
          <IconButton
            target={{ kind: 'collection', id: collectionId }}
            name="collection"
            size={toolbarIconSize}
          />
        )}
        {!collectionId &&
          libraryId !== undefined &&
          relativePath !== undefined && (
            <IconButton
              target={{ kind: 'entry', libraryId, relativePath }}
              name={relativePath.split('/').at(-1) || 'folder'}
              size={toolbarIconSize}
            />
          )}
        <div key="view" className={styles.controlGroup}>
          <ButtonGroup role="group" aria-label="File view">
            {(['list', 'grid', 'masonry'] as const).map((mode) => (
              <Button
                key={mode}
                aria-label={`${viewLabels[mode]} view`}
                title={`${viewLabels[mode]} view`}
                aria-pressed={viewMode === mode}
                onClick={() => onViewModeChange(mode)}
              >
                <Icon name={mode} size={toolbarIconSize} />
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <div key="sort" className={styles.controlGroup}>
          <Select
            label="Sort by"
            value={currentSort?.id ?? null}
            onValueChange={(id) => {
              if (id === null) {
                table.setSorting([])
                return
              }

              const isCurrentSort = currentSort?.id === id

              table.setSorting([
                { id, desc: isCurrentSort ? !currentSort.desc : false },
              ])
            }}
            displayValue={`${currentSortLabel}${currentSortDirection ? ` (${currentSortDirection})` : ''
              }`}
          >
            <Select.MenuItem value={null}>Default order</Select.MenuItem>
            {table.getAllLeafColumns().map((column) => (
              <Select.MenuItem key={column.id} value={column.id}>
                {fileColumnLabels[column.id as FileColumn]}
                {currentSort?.id === column.id
                  ? ` (${currentSortDirection})`
                  : ''}
              </Select.MenuItem>
            ))}
          </Select>
        </div>
        <div key="group" className={styles.controlGroup}>
          <Select
            label="Group by"
            value={groupBy}
            onValueChange={(value) =>
              onGroupByChange(value as FileColumn | null)
            }
            displayValue={currentGroupLabel}
          >
            <Select.MenuItem value={null}>None</Select.MenuItem>
            {table.getAllLeafColumns().map((column) => (
              <Select.MenuItem key={column.id} value={column.id}>
                {fileColumnLabels[column.id as FileColumn]}
              </Select.MenuItem>
            ))}
          </Select>
        </div>
        {canFavorite && (
          <FavoriteSetting
            key="favorite"
            busy={favoriteBusy}
            isFavorite={isFavorite}
            onChange={updateFavorite}
          />
        )}
        {viewMode === 'list' && (
          <Menu
            key="columns"
            label="Columns"
            trigger={<Icon name="columns" size={toolbarIconSize} />}
          >
            <ColumnSettings table={table} />
          </Menu>
        )}
        {currentFolderPath && !collectionId && !flattenLocked && (
          <label
            key="flatten"
            className={styles.menuSetting}
            htmlFor={flattenSwitchId}
          >
            <span>Flatten view</span>
            <Switch
              id={flattenSwitchId}
              title="Show files from all subfolders and hide folders"
              checked={flatten}
              onCheckedChange={onFlattenChange}
            />
          </label>
        )}
        <label
          htmlFor={fileExtensionsSwitchId}
          key="fileextensions"
          className={styles.menuSetting}
        >
          <span>Show file extensions</span>
          <Switch
            id={fileExtensionsSwitchId}
            title="Show file extensions"
            checked={false}
            onCheckedChange={() => { }}
          />
        </label>
        <div key="details" className={styles.controlGroup}>
          <Button
            variant="ghost"
            aria-label={detailsOpen ? 'Hide details' : 'Show details'}
            title={detailsOpen ? 'Hide details' : 'Show details'}
            aria-pressed={detailsOpen}
            onClick={() => onDetailsOpenChange(!detailsOpen)}
          >
            <Icon
              name={detailsOpen ? 'hideDetails' : 'showDetails'}
              size={toolbarIconSize}
            />
          </Button>
        </div>
      </OverflowToolbar>
    </>
  )
}
