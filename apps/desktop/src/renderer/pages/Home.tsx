import { Eyebrow, Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { Link } from 'react-router-dom'
import Files from '../components/Files.js'
import { useLibraries } from '../hooks/useLibraries.js'
import { getLibraryIcon } from '../utils/libraryIcon.js'
import Page from './Page.js';

const styles = css`
  .libraries {
    display: flex;
    flex-wrap: wrap;
    gap: var(--suzy-space-2);

    .libraryCard {
      display: flex;
      flex-direction: column;
      gap: var(--suzy-space-2);
      padding: var(--suzy-space-4) var(--suzy-space-6);
      background: var(--suzy-gray-2);
      border-radius: var(--suzy-radius-3);
      text-decoration: none;
      color: inherit;

      .icon {
        margin-block: var(--suzy-space-2);
      }
    }
  }
  .section {
    margin-block-end: var(--suzy-space-5);
  }
`

export default function Home() {
  const { libraries, loadFailed } = useLibraries()

  return (
    <Page title="Home">
      <section className={styles.section}>
        <Eyebrow>Libraries</Eyebrow>
        {loadFailed && <p role="status">Unable to load folders.</p>}
        <div className={styles.libraries}>
          {libraries.map((library) => (
            <Link
              key={library.id}
              to={`/libraries/${library.id}`}
              title={library.rootPath}
              className={styles.libraryCard}
            >
              <Icon
                name={getLibraryIcon(library.name)}
                size="32"
                className={styles.icon}
              />
              <span>{library.name}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.section}>
        <Eyebrow>Files</Eyebrow>
        {libraries[0] ? (
          <Files folder={{ libraryId: libraries[0].id, relativePath: '' }} />
        ) : !loadFailed ? (
          <p role="status">No folder available.</p>
        ) : null}
      </section>
    </Page>
  )
}
