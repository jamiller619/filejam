import type { Volume } from '@filejam/server'
import { Eyebrow, Icon, type IconName } from '@filejam/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useSettings } from '~/hooks/useSettings.js'
import { useCollections } from '../../hooks/useCollections.js'
import { useFavoriteFolderDrop } from '../../hooks/useFavoriteFolderDrop.js'
import { useFolderDrag } from '../../hooks/useFolderDrag.js'
import { useLocations } from '../../hooks/useLocations.js'
import { useVolumes } from '../../hooks/useVolumes.js'
import { folderUrl, isCurrentFolderUrl } from '../../utils/folderUrl.js'
import { normalizePath } from '../../utils/normalizePath.js'

const styles = css`
  .navbar {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--suzy-space-2);

    .eyebrow { margin-block-start: var(--suzy-space-3); }
    ol {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      gap: var(--suzy-space-1);
      list-style: none;
      margin: var(--suzy-space-6) 0 0;
      padding: 0;
      overflow-y: auto;

      a {
        display: flex;
        align-items: center;
        text-decoration: none;
        gap: var(--suzy-space-2);
        color: var(--suzy-gray-12);
        line-height: 1;
        padding: var(--suzy-space-1) var(--suzy-space-2);
        border-radius: var(--suzy-radius-3);
        corner-shape: var(--suzy-corner-shape);
        &:hover { background: lch(from var(--suzy-gray-11) l c h / 20%); }
        &[aria-current='page'] {
          background: var(--suzy-accent-9);
          color: var(--suzy-accent-1);
        }
      }
    }
    .favorites {
      border-radius: var(--suzy-radius-3);
      outline: 2px solid transparent;
      &[data-dragging='true'] {
        outline-color: var(--suzy-accent-9);
        background: var(--suzy-gray-4);
      }
      ol { margin: 0; overflow: visible; }
    }
    .dropHint {
      padding: var(--suzy-space-2);
      color: var(--suzy-gray-11);
      font-size: 0.85em;
    }
    .settings { margin-block-start: auto; }
  }
`

const locationIcons: Record<string, IconName> = {
  applications: 'grid',
  desktop: 'desktop',
  downloads: 'download',
  documents: 'documents',
  music: 'music',
  pictures: 'image',
  trash: 'trash',
}

export default function Navbar(props: HTMLAttributes<HTMLDivElement>) {
  const currentLocation = useLocation()
  const { volumes, loadFailed: volumesFailed } = useVolumes()
  const { locations, loadFailed: locationsFailed } = useLocations()
  const { collections, loadFailed: collectionsFailed } = useCollections()
  const { dropError, dropTargetProps } = useFavoriteFolderDrop()
  const folderDragProps = useFolderDrag()
  const favoriteFolders = useFavoriteFolders(volumes)
  const deviceVolumes = volumes.filter((volume) => !volume.isTrash)
  const currentFolder = (volumeId: number, relativePath = '') =>
    isCurrentFolderUrl(currentLocation, { volumeId, relativePath })

  return (
    <nav {...props} className={clsx(styles.navbar, props.className)}>
      <ol>
        <li>
          <NavLink to="/" end title="Home" viewTransition>
            <Icon name="home" size="20" />
            <span>Home</span>
          </NavLink>
        </li>

        <li className={styles.favorites} {...dropTargetProps}>
          <Eyebrow className={styles.eyebrow}>Favorites</Eyebrow>
          {favoriteFolders.length === 0 && (
            <div className={styles.dropHint}>Drop folders here</div>
          )}
          <ol aria-label="Favorite folders">
            {favoriteFolders.map(({ path, volume, relativePath, name }) => (
              <li key={path}>
                <Link
                  to={folderUrl({ volumeId: volume.id, relativePath })}
                  title={path}
                  viewTransition
                  aria-current={
                    currentFolder(volume.id, relativePath) ? 'page' : undefined
                  }
                  {...folderDragProps(path)}
                >
                  <Icon name="folder" size="20" />
                  <span>{name}</span>
                </Link>
              </li>
            ))}
          </ol>
          {dropError && <p role="alert">{dropError}</p>}
        </li>

        <li>
          <Eyebrow className={styles.eyebrow}>Locations</Eyebrow>
        </li>
        {locations.map((location) => (
          <li key={location.id}>
            <Link
              to={folderUrl(location)}
              viewTransition
              aria-current={
                currentFolder(location.volumeId, location.relativePath)
                  ? 'page'
                  : undefined
              }
            >
              <Icon name={locationIcons[location.id] ?? 'folder'} size="20" />
              <span>{location.name}</span>
            </Link>
          </li>
        ))}
        {locationsFailed && <li role="status">Unable to load locations.</li>}

        {deviceVolumes.length > 0 && (
          <li>
            <Eyebrow className={styles.eyebrow}>Devices</Eyebrow>
          </li>
        )}
        {deviceVolumes.map((volume) => (
          <li key={volume.id}>
            <Link
              to={folderUrl({ volumeId: volume.id, relativePath: '' })}
              title={volume.rootPath}
              viewTransition
              aria-current={currentFolder(volume.id) ? 'page' : undefined}
              {...folderDragProps(volume.rootPath)}
            >
              <Icon name="hard-drive" size="20" />
              <span>{volume.name}</span>
            </Link>
          </li>
        ))}
        {volumesFailed && <li role="status">Unable to load devices.</li>}

        <li>
          <Eyebrow className={styles.eyebrow}>Collections</Eyebrow>
        </li>
        {collections.map((collection) => (
          <li key={collection.id}>
            <NavLink to={`/collections/${collection.id}`} viewTransition>
              <Icon name="folder" size="20" />
              <span>{collection.name}</span>
            </NavLink>
          </li>
        ))}
        {collectionsFailed && (
          <li role="status">Unable to load collections.</li>
        )}

        <li className={styles.settings}>
          <NavLink to="/settings" title="Settings" viewTransition>
            <Icon name="settings" size="20" />
            <span>Settings</span>
          </NavLink>
        </li>
      </ol>
    </nav>
  )
}

function useFavoriteFolders(volumes: Volume[]) {
  const { values } = useSettings(['user.favoriteFolders'])
  const favoritePaths = values?.['user.favoriteFolders'] ?? []

  return favoritePaths.flatMap((path) => {
    const target = normalizePath(path)
    const volume = volumes
      .filter((item) => !item.isTrash)
      .filter((item) => {
        const root = normalizePath(item.rootPath)

        return target === root || target.startsWith(`${root}/`)
      })
      .sort((a, b) => b.rootPath.length - a.rootPath.length)[0]

    if (!volume) {
      return []
    }

    const root = volume.rootPath.replace(/[\\/]+$/, '')
    const relativePath = path
      .slice(root.length)
      .replace(/^[\\/]+/, '')
      .replaceAll('\\', '/')
    const name = relativePath.split('/').filter(Boolean).at(-1) ?? volume.name

    return [{ path, volume, relativePath, name }]
  })
}
