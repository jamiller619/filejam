import type { Library } from '@filejam/server'
import { Button, Eyebrow, Icon } from '@filejam/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useSettings } from '~/hooks/useSettings.js'
import { useCollections } from '../../hooks/useCollections.js'
import { useFavoriteFolderDrop } from '../../hooks/useFavoriteFolderDrop.js'
import { useFolderDrag } from '../../hooks/useFolderDrag.js'
import { useLibraries } from '../../hooks/useLibraries.js'
import { folderUrl, isCurrentFolderUrl } from '../../utils/folderUrl.js'
import { getLibraryIcon } from '../../utils/libraryIcon.js'
import { normalizePath } from '../../utils/normalizePath.js'
import { IconButton } from '../icons/ItemIcon.js'

const styles = css`
  .item {
    display: flex;
    align-items: center;
    min-width: 0;
    border-radius: var(--suzy-radius-3);

    > a {
      flex: 1;
      min-width: 0;
      width: 0;
    }

    > a > span:last-child {
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
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
        padding: var(--suzy-space-1) var(--suzy-space-2);
        width: stretch;
        height: stretch;
        line-height: 18px;
        justify-content: start;
      }

      .item {
        corner-shape: var(--suzy-corner-shape);
        transition: background var(--suzy-duration-fast) var(--suzy-ease-enter);

        &:hover,
        &:focus-within {
          background: lch(from var(--suzy-gray-12) l c h / 12%);
        }

        &:has(> a[aria-current='page']) {
          background: var(--suzy-accent-9);
          color: var(--suzy-accent-1);
        }

        > a,
        > a:hover,
        > a:focus,
        > button,
        > button:hover {
          background: transparent;
        }
      }

      .item > button {
        align-self: stretch;
        min-height: 0;
        padding: var(--suzy-space-1) var(--suzy-space-2);
        line-height: 1;
        background: transparent;
      }

      .item:has(> button) > a {
        padding-inline-start: 0;
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

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--suzy-space-2);
      padding-block: var(--suzy-space-2);

      button {
        padding: var(--suzy-space-4) 0;
        flex-direction: column;
      }
    }
  }
`

export default function Navbar(props: HTMLAttributes<HTMLDivElement>) {
  const location = useLocation()
  const { libraries, loadFailed } = useLibraries()

  const { collections, loadFailed: collectionsFailed } = useCollections()

  const { dropError, dropTargetProps } = useFavoriteFolderDrop()
  const folderDragProps = useFolderDrag()
  const favoriteFolders = useFavoriteFolders(libraries)

  const favoriteLibraryIds = new Set(
    favoriteFolders
      .filter((favorite) => favorite.relativePath === '')
      .map((favorite) => favorite.library.id),
  )

  const otherLibraries = libraries.filter(
    (library) => !library.isTrash && !favoriteLibraryIds.has(library.id),
  )

  const trashLibraries = libraries.filter((library) => library.isTrash)

  const currentFolder = (libraryId: number, relativePath = '') =>
    isCurrentFolderUrl(location, { libraryId, relativePath })

  return (
    <nav {...props} className={clsx(styles.navbar, props.className)}>
      <ol>
        <li className={styles.item}>
          <Button
            as={NavLink}
            variant="link"
            to="/"
            end
            title="Home"
            viewTransition
          >
            <Icon name="home" size="20" />
            <span>Home</span>
          </Button>
        </li>
        <li className={styles.favorites} {...dropTargetProps}>
          <Eyebrow className={styles.eyebrow}>Favorites</Eyebrow>
          {favoriteFolders.length === 0 && (
            <div className={styles.dropHint}>Drop folders here</div>
          )}
          <ol aria-label="Favorite folders">
            {favoriteFolders.map(({ path, library, relativePath }) => (
              <li key={path} className={styles.item}>
                <IconButton
                  name={
                    relativePath.split('/').filter(Boolean).at(-1) ??
                    library.name
                  }
                  target={{
                    kind: 'entry',
                    libraryId: library.id,
                    relativePath,
                  }}
                  fallback={
                    <Icon
                      name={
                        relativePath ? 'folder' : getLibraryIcon(library.name)
                      }
                      size={20}
                    />
                  }
                />
                <Button
                  as={Link}
                  variant="link"
                  to={folderUrl({ libraryId: library.id, relativePath })}
                  title={path}
                  viewTransition
                  aria-current={
                    currentFolder(library.id, relativePath) ? 'page' : undefined
                  }
                  {...folderDragProps(path)}
                >
                  <span>
                    {relativePath.split('/').filter(Boolean).at(-1) ??
                      library.name}
                  </span>
                </Button>
              </li>
            ))}
          </ol>
          {dropError && <p role="alert">{dropError}</p>}
        </li>
        <li>
          <Eyebrow className={styles.eyebrow}>Libraries</Eyebrow>
        </li>
        {otherLibraries.map((library) => (
          <li key={library.id} className={styles.item}>
            <IconButton
              name={library.name}
              target={{
                kind: 'entry',
                libraryId: library.id,
                relativePath: '',
              }}
              fallback={<Icon name={getLibraryIcon(library.name)} size={20} />}
            />
            <Button
              as={Link}
              variant="link"
              to={`/libraries/${library.id}`}
              title={library.rootPath}
              viewTransition
              aria-current={currentFolder(library.id) ? 'page' : undefined}
              {...folderDragProps(library.rootPath)}
            >
              <span>{library.name}</span>
            </Button>
          </li>
        ))}
        {loadFailed && <li role="status">Unable to load libraries</li>}
        {trashLibraries.map((library) => {
          const drive = library.rootPath.match(/^[a-z]:/i)?.[0].toUpperCase()

          const label =
            trashLibraries.length > 1 && drive
              ? `${drive} ${library.name}`
              : library.name

          return (
            <li key={library.id} className={styles.item}>
              <Button
                as={Link}
                variant="link"
                to={`/libraries/${library.id}`}
                title={library.rootPath}
                viewTransition
                aria-current={currentFolder(library.id) ? 'page' : undefined}
              >
                <Icon name="trash" size="20" />
                <span>{label}</span>
              </Button>
            </li>
          )
        })}
        <li>
          <Eyebrow className={styles.eyebrow}>Collections</Eyebrow>
        </li>
        {collections.map((collection) => (
          <li key={collection.id} className={styles.item}>
            <IconButton
              target={{ kind: 'collection', id: collection.id }}
              name={collection.name}
            />
            <Button
              as={Link}
              variant="link"
              to={`/collections/${collection.id}`}
              viewTransition
            >
              <span>{collection.name}</span>
            </Button>
          </li>
        ))}
        {collectionsFailed && (
          <li role="status">Unable to load collections.</li>
        )}
        <li className={styles.actions}>
          <Button block size="sm">
            <Icon size={22} name="folder" />
            <span>Add library</span>
          </Button>
          <Button block size="sm">
            <Icon size={22} name="list" />
            <span>Add collection</span>
          </Button>
        </li>
        <li className={clsx(styles.item, styles.settings)}>
          <Button
            as={NavLink}
            variant="link"
            to="/settings"
            title="Settings"
            viewTransition
          >
            <Icon name="settings" size="20" />
            <span>Settings</span>
          </Button>
        </li>
      </ol>
    </nav>
  )
}

function useFavoriteFolders(libraries: Library[]) {
  const { values } = useSettings(['user.favoriteFolders'])
  const favoritePaths = values?.['user.favoriteFolders'] ?? []

  const favoriteFolders = favoritePaths.flatMap((path) => {
    const library = libraries.find((item) => {
      if (item.isTrash) {
        return false
      }

      const root = normalizePath(item.rootPath)
      const target = normalizePath(path)

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

  return favoriteFolders
}
