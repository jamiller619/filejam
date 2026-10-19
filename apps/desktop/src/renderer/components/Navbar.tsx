import { Eyebrow, Icon } from '@files/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react'
import { NavLink } from 'react-router-dom'
import { useConfig } from '~/hooks/useConfig.js'
import { useCollections } from '../hooks/useCollections.js'
import { useLibraries } from '../hooks/useLibraries.js'
import { folderUrl } from '../utils/folderUrl.js'
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

    .settings {
      margin-block-start: auto;
    }
  }
`

export default function Navbar(props: HTMLAttributes<HTMLDivElement>) {
  const { libraries, loadFailed } = useLibraries()

  const { collections: allCollections, loadFailed: collectionsFailed } =
    useCollections()
  const collections = allCollections.filter(
    (item) => !['recents', 'favorites'].includes(item.id),
  )

  const { values } = useConfig(['user.favoriteFolders'])
  const favoritePaths = values?.['user.favoriteFolders'] ?? []
  const favoriteFolders = favoritePaths.flatMap((path) => {
    const library = libraries.find((item) => {
      if (item.isTrash) return false
      const root = item.rootPath.replace(/[\\/]+$/, '')
      return (
        path === item.rootPath ||
        path.startsWith(`${root}/`) ||
        path.startsWith(`${root}\\`)
      )
    })
    if (!library) return []
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

  return (
    <nav {...props} className={clsx(styles.navbar, props.className)}>
      <ol>
        <li>
          <NavLink to="/" end title="Home">
            <Icon name="home" size="20" />
            <span>Home</span>
          </NavLink>
        </li>
        {favoriteFolders.length > 0 && (
          <li>
            <Eyebrow className={styles.eyebrow}>Favorites</Eyebrow>
          </li>
        )}
        {favoriteFolders.map(({ path, library, relativePath }) => (
          <li key={path}>
            <NavLink
              to={folderUrl({ libraryId: library.id, relativePath })}
              title={path}
            >
              <Icon
                name={relativePath ? 'folder' : getLibraryIcon(library.name)}
                size="20"
              />
              <span>
                {relativePath.split('/').filter(Boolean).at(-1) ?? library.name}
              </span>
            </NavLink>
          </li>
        ))}
        <li>
          <Eyebrow className={styles.eyebrow}>Libraries</Eyebrow>
        </li>
        {otherLibraries.map((library) => (
          <li key={library.id}>
            <NavLink to={`/libraries/${library.id}`} title={library.rootPath}>
              <Icon name={getLibraryIcon(library.name)} size="20" />
              <span>{library.name}</span>
            </NavLink>
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
              <NavLink to={`/libraries/${library.id}`} title={library.rootPath}>
                <Icon name="trash" size="20" />
                <span>{label}</span>
              </NavLink>
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
