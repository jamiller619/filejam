import { Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { Link } from 'react-router-dom'
import { getLibraryIcon } from '~/utils/libraryIcon.js'
import FolderIcon from '../assets/FolderIcon.js'
import Files from '../components/Files.js'
import { useLibraries } from '../hooks/useLibraries.js'
import Page from './Page.js'

const styles = css`
  .libraries {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
    gap: var(--suzy-space-2);

    .libraryCard {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: var(--suzy-space-2);
      padding: var(--suzy-space-4);
      background: var(--suzy-gray-3);
      border-radius: var(--suzy-radius-3);
      text-decoration: none;
      color: inherit;
      overflow-wrap: anywhere;

      .libraryIcon {
        position: relative;
        width: 100%;
        max-width: 144px;
        aspect-ratio: 1;
        align-self: center;
      }

      .icon {
        position: absolute;
        top: 56%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--suzy-accent-6);
      }

      .iconFolder {
        width: 100%;
        height: auto;
        aspect-ratio: 1;
        display: block;
      }
    }
  }
`

export default function Home() {
  const { libraries, loadFailed } = useLibraries()
  const userLibraries = libraries.filter((library) => !library.isTrash)

  return (
    <Page title="Home">
      <section className={styles.section}>
        {loadFailed && <p role="status">Unable to load folders.</p>}
        <div className={styles.libraries}>
          {userLibraries.map((library) => (
            <Link
              key={library.id}
              to={`/libraries/${library.id}`}
              title={library.rootPath}
              className={styles.libraryCard}
            >
              <div className={styles.libraryIcon}>
                <FolderIcon className={styles.iconFolder} title={library.rootPath} />
                <Icon
                  name={getLibraryIcon(library.name)}
                  size="48"
                  className={styles.icon}
                />
              </div>
              <span>{library.name}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.section}>
        {userLibraries[0] ? (
          <Files
            folder={{ libraryId: userLibraries[0].id, relativePath: '' }}
          />
        ) : !loadFailed ? (
          <p role="status">No folder available.</p>
        ) : null}
      </section>
    </Page>
  )
}
