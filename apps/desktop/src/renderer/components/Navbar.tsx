import { Eyebrow, Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { NavLink } from 'react-router-dom'
import { useConfig } from '~/hooks/useConfig.js'
import { useCollections } from '../hooks/useCollections.js'
import { useLibraries } from '../hooks/useLibraries.js'
import { getLibraryIcon } from '../utils/libraryIcon.js'

const styles = css`
  .navbar {
    display: flex;
    flex-direction: column;
    padding: var(--suzy-space-2);
    border-radius: var(--suzy-radius-3);

    .eyebrow {
      margin-block-start: var(--suzy-space-3);
    }

    ol {
      display: flex;
      flex: 1 0 auto;
      flex-direction: column;
      gap: var(--suzy-space-1);
      list-style: none;
      margin: 0;
      padding: 0;
      a {
        display: flex;
        align-items: center;
        text-decoration: none;
        gap: var(--suzy-space-2);
        color: var(--suzy-gray-11);
        line-height: 0;
        padding: var(--suzy-space-1) var(--suzy-space-2);

        &:hover {
          background: var(--suzy-gray-5);
          color: var(--suzy-gray-12);
          border-radius: var(--suzy-radius-2);
        }

        &[aria-current='page'] {
          background: var(--suzy-accent-9);
          color: var(--suzy-accent-1);
          border-radius: var(--suzy-radius-2);
        }
      }
    }

    .settings {
      margin-block-start: auto;
    }
  }
`

export default function Navbar() {
  const { libraries, loadFailed } = useLibraries()

  const { collections: allCollections, loadFailed: collectionsFailed } =
    useCollections()
  const collections = allCollections.filter(
    (item) => !['recents', 'favorites'].includes(item.id),
  )

  const {
    values,
  } = useConfig(['user.favoriteLibraries'])

  return (
    <nav className={styles.navbar}>
      <ol>
        <li>
          <NavLink to="/" end title="Home">
            <Icon name="home" size="20" />
            <span>Home</span>
          </NavLink>
        </li>
        <li>
          <Eyebrow className={styles.eyebrow}>Favorites</Eyebrow>
        </li>
        {values?.['user.favoriteLibraries'].map((library) => (
          <li key={library}>

          </li>
        ))}
        <li>
          <Eyebrow className={styles.eyebrow}>Libraries</Eyebrow>
        </li>
        {libraries.map((library) => (
          <li key={library.id}>
            <NavLink to={`/libraries/${library.id}`} title={library.rootPath}>
              <Icon name={getLibraryIcon(library.name)} size="20" />
              <span>{library.name}</span>
            </NavLink>
          </li>
        ))}
        {loadFailed && <li role="status">Unable to load folders.</li>}
        <li>
          <NavLink to="/trash" title="Trash">
            <Icon name="trash" size="20" />
            <span>Trash</span>
          </NavLink>
        </li>
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
