import type { Library } from '@filejam/server'
import type { IconTarget } from '@filejam/server/icons'
import { Button, Eyebrow, Icon } from '@filejam/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes, ReactNode } from 'react'
import { Link, matchPath, useLocation, useResolvedPath } from 'react-router'
import { useSettings } from '~/hooks/useSettings.js'
import { useCollections } from '../../hooks/useCollections.js'
import { useFavoriteFolderDrop } from '../../hooks/useFavoriteFolderDrop.js'
import { useLibraries } from '../../hooks/useLibraries.js'
import { folderUrl, isCurrentFolderUrl } from '../../utils/folderUrl.js'
import { normalizePath } from '../../utils/normalizePath.js'
import { IconButton } from '../icons/ItemIcon.js'

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

      .item {
        display: flex;
        align-items: stretch;
        flex-shrink: 0;
        min-width: 0;
        border-radius: var(--suzy-radius-3);
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

      .item > a,
      .item > button {
        box-sizing: border-box;
        min-height: calc(20px + 2 * var(--suzy-space-1));
        padding: var(--suzy-space-1) var(--suzy-space-2);
        gap: var(--suzy-space-2);
        font: inherit;
        line-height: 20px;
      }

      .item > a {
        flex: 1;
        min-width: 0;
        justify-content: start;
      }

      .item > a > span:last-child {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .item:has(> button) > a {
        padding-inline-start: 0;
      }
    }

    .staticIcon {
      display: inline-flex;
      flex: 0 0 20px;
      align-items: center;
      justify-content: center;
      height: 20px;
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
  const { libraries, loadFailed } = useLibraries()

  const { collections, loadFailed: collectionsFailed } = useCollections()
  const { dropError, dropTargetProps } = useFavoriteFolderDrop()
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

  return (
    <nav {...props} className={clsx(styles.navbar, props.className)}>
      <ol>
        <NavItem href="/" name="Home" icon={<Icon name="home" size={20} />} />
        <li className={styles.favorites} {...dropTargetProps}>
          <Eyebrow className={styles.eyebrow}>Favorites</Eyebrow>
          {favoriteFolders.length === 0 && (
            <div className={styles.dropHint}>Drop folders here</div>
          )}
          <ol aria-label="Favorite folders">
            {favoriteFolders.map(({ path, library, relativePath }) => (
              <NavItem
                key={path}
                href={folderUrl({ libraryId: library.id, relativePath })}
                name={
                  relativePath.split('/').filter(Boolean).at(-1) ?? library.name
                }
                title={path}
                iconTarget={{
                  kind: 'entry',
                  libraryId: library.id,
                  relativePath,
                }}
                icon={
                  <Icon
                    name={
                      relativePath ? 'folder' : getLibraryIcon(library.name)
                    }
                    size={20}
                  />
                }
              />
            ))}
          </ol>
          {dropError && <p role="alert">{dropError}</p>}
        </li>

        <li>
          <Eyebrow className={styles.eyebrow}>Libraries</Eyebrow>
        </li>
        {otherLibraries.map((library) => (
          <NavItem
            key={library.id}
            href={folderUrl({ libraryId: library.id, relativePath: '' })}
            name={library.name}
            title={library.rootPath}
            iconTarget={{
              kind: 'entry',
              libraryId: library.id,
              relativePath: '',
            }}
            icon={<Icon name={getLibraryIcon(library.name)} size={20} />}
          />
        ))}
        {loadFailed && <li role="status">Unable to load libraries</li>}
        {trashLibraries.map((library) => {
          const drive = library.rootPath.match(/^[a-z]:/i)?.[0].toUpperCase()
          deviceVolumes.length > 0 && (
            <li>
              <Eyebrow className={styles.eyebrow}>Devices</Eyebrow>
            </li>
          )
          deviceVolumes.map((volume) => (
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
          ))
          volumesFailed && <li role="status">Unable to load devices.</li>

          return (
            <NavItem
              key={library.id}
              href={folderUrl({ libraryId: library.id, relativePath: '' })}
              name={label}
              title={library.rootPath}
              icon={<Icon name="trash" size={20} />}
            />
          )
        })}
        <li>
          <Eyebrow className={styles.eyebrow}>Collections</Eyebrow>
        </li>
        {collections.map((collection) => (
          <NavItem
            key={collection.id}
            href={`/collections/${collection.id}`}
            name={collection.name}
            iconTarget={{ kind: 'collection', id: collection.id }}
          />
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
        <NavItem
          className={styles.settings}
          href="/settings"
          name="Settings"
          icon={<Icon name="settings" size={20} />}
        />
      </ol>
    </nav>
  )
}

type NavItemProps = HTMLAttributes<HTMLLIElement> & {
  name: string
  href: string
  icon?: ReactNode
  iconTarget?: IconTarget
}

function NavItem({
  name,
  href,
  icon,
  iconTarget,
  title = name,
  className,
  ...props
}: NavItemProps) {
  const location = useLocation()
  const destination = useResolvedPath(href)
  const libraryRoute = matchPath('/libraries/:libraryId', destination.pathname)

  const current = libraryRoute
    ? isCurrentFolderUrl(location, {
      libraryId: Number(libraryRoute.params.libraryId),
      relativePath:
        new URLSearchParams(destination.search).get('folder') ?? '',
    })
    : !!matchPath(
      { path: destination.pathname, end: destination.pathname === '/' },
      location.pathname,
    )

  return (
    <li className={clsx(styles.item, className)} {...props}>
      {iconTarget && (
        <IconButton target={iconTarget} name={name} fallback={icon} size={20} />
      )}
      <Button
        as={Link}
        variant="link"
        to={href}
        title={title}
        viewTransition
        aria-current={current ? 'page' : undefined}
      >
        {!iconTarget && (
          <span className={styles.staticIcon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span>{name}</span>
      </Button>
    </li>
  )
}

function useFavoriteFolders(libraries: Library[]) {
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
