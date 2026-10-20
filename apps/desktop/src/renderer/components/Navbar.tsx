import { Eyebrow, Icon } from '@files/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useConfig } from '~/hooks/useConfig.js'
import { useCollections } from '../hooks/useCollections.js'
import { useFavoriteFolderDrop } from '../hooks/useFavoriteFolderDrop.js'
import { useFolderDrag } from '../hooks/useFolderDrag.js'
import { useLibraries } from '../hooks/useLibraries.js'
import { folderUrl, isCurrentFolderUrl } from '../utils/folderUrl.js'
import { getLibraryIcon } from '../utils/libraryIcon.js'

const styles = css`
  .navbar {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: var(--suzy-space-2);

    .eyebrow {
      margin-block-start: var(--suzy-space-3);
    }

    ol {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      gap: var(--suzy-space-1);
      list-style: none;
      margin: var(--suzy-space-6) 0 0;
      padding: 0;

      a {
        display: flex;
        align-items: center;
        text-decoration: none;
        gap: var(--suzy-space-2);
        color: var(--suzy-gray-12);
        line-height: 0;
        padding: var(--suzy-space-1) var(--suzy-space-2);
        border-radius: var(--suzy-radius-3);
        corner-shape: var(--suzy-corner-shape);

        &:hover {
          background: lch(from var(--suzy-gray-11) l c h / 20%);
          color: var(--suzy-gray-12);
        }

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
      ol { margin: 0; }
    }
    .dropHint { padding: var(--suzy-space-2); color: var(--suzy-gray-11); font-size: 0.85em; }
    .settings {
      margin-block-start: auto;
    }
  }
`

export default function Navbar(props: HTMLAttributes<HTMLDivElement>) {
  const location = useLocation()
  const { libraries, loadFailed } = useLibraries()

  const { collections: allCollections, loadFailed: collectionsFailed } =
    useCollections()

  const collections = allCollections.filter(
    (item) => !['recents', 'favorites'].includes(item.id),
  )

  const { dropError, dropTargetProps } = useFavoriteFolderDrop()
  const folderDragProps = useFolderDrag()
  const { values } = useConfig(['user.favoriteFolders'])
  const favoritePaths = values?.['user.favoriteFolders'] ?? []

  const favoriteFolders = favoritePaths.flatMap((path) => {
    const library = libraries.find((item) => {
      if (item.isTrash) {
        return false
      }

      const normalize = (value: string) => {
        const normalized = value.replaceAll('\\', '/').replace(/\/+$/, '')

        return /^[a-z]:|^\\\\/i.test(value)
          ? normalized.toLowerCase()
          : normalized
      }

      const root = normalize(item.rootPath)
      const target = normalize(path)

      return target === root || target.startsWith(`${root}/`)
    })

    if (!library) {
      return []
    }

    const root = library.rootPath.replace(/[\\/]+$/, '')

    const relativePath = path
      .slice(root.length)
      .replace(/^[\\/]+/, '')
      .replaceAll('\\', '/')

    return [{ path, library, relativePath }]
  })

  const favoritePathSet = new Set(favoritePaths)

  const otherLibraries = libraries.filter(
    (library) => !library.isTrash && !favoritePathSet.has(library.rootPath),
  )

  const trashLibraries = libraries.filter((library) => library.isTrash)

  const currentFolder = (libraryId: number, relativePath = '') =>
    isCurrentFolderUrl(location, { libraryId, relativePath })

  return (
    <nav {...props} className={clsx(styles.navbar, props.className)}>
      <ol>
        <li>
          <NavLink to="/" end title="Home">
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
            {favoriteFolders.map(({ path, library, relativePath }) => (
              <li key={path}>
                <Link
                  to={folderUrl({ libraryId: library.id, relativePath })}
                  title={path}
                  aria-current={
                    currentFolder(library.id, relativePath) ? 'page' : undefined
                  }
                  {...folderDragProps(path)}
                >
                  <Icon
                    name={
                      relativePath ? 'folder' : getLibraryIcon(library.name)
                    }
                    size="20"
                  />
                  <span>
                    {relativePath.split('/').filter(Boolean).at(-1) ??
                      library.name}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {dropError && <p role="alert">{dropError}</p>}
        </li>
        <li>
          <Eyebrow className={styles.eyebrow}>Libraries</Eyebrow>
        </li>
        {otherLibraries.map((library) => (
          <li key={library.id}>
            <Link
              to={`/libraries/${library.id}`}
              title={library.rootPath}
              aria-current={currentFolder(library.id) ? 'page' : undefined}
              {...folderDragProps(library.rootPath)}
            >
              <Icon name={getLibraryIcon(library.name)} size="20" />
              <span>{library.name}</span>
            </Link>
          </li>
        ))}
        {loadFailed && <li role="status">Unable to load folders.</li>}
        {trashLibraries.map((library) => {
          const drive = library.rootPath.match(/^[a-z]:/i)?.[0].toUpperCase()

          const label =
            trashLibraries.length > 1 && drive
              ? `${drive} ${library.name}`
              : library.name

          return (
            <li key={library.id}>
              <Link
                to={`/libraries/${library.id}`}
                title={library.rootPath}
                aria-current={currentFolder(library.id) ? 'page' : undefined}
              >
                <Icon name="trash" size="20" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
        <li>
          <Eyebrow className={styles.eyebrow}>Collections</Eyebrow>
        </li>
        <li>
          <NavLink to="/collections/recents" title="Recents">
            <Icon name="clock" size="20" />
            <span>Recents</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/collections/favorites" title="Favorites">
            <Icon name="star" size="20" />
            <span>Favorites</span>
          </NavLink>
        </li>
        {collections.map((collection) => (
          <li key={collection.id}>
            <NavLink to={`/collections/${collection.id}`}>
              <Icon name="folder" size="20" />
              <span>{collection.name}</span>
            </NavLink>
          </li>
        ))}
        {collectionsFailed && (
          <li role="status">Unable to load collections.</li>
        )}
        <li className={styles.settings}>
          <NavLink to="/settings" title="Settings">
            <Icon name="settings" size="20" />
            <span>Settings</span>
          </NavLink>
        </li>
      </ol>
    </nav>
  )
}
