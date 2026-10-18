import FilePreview from '../components/FilePreview.js'
import Files from '../components/Files.js'
import GridCard from '../components/GridCard.js'
import GridContainer from '../components/GridContainer.js'
import { useLibraries } from '../hooks/useLibraries.js'
import Page from './Page.js'

export default function Home() {
  const { libraries, loadFailed } = useLibraries()
  const userLibraries = libraries.filter((library) => !library.isTrash)

  return (
    <Page title="Home">
      <section>
        {loadFailed && <p role="status">Unable to load folders.</p>}
        <GridContainer aria-label="Libraries">
          {userLibraries.map((library) => (
            <GridCard
              key={library.id}
              to={`/libraries/${library.id}`}
              title={library.rootPath}
              name={library.name}
            >
              <FilePreview
                entry={{
                  libraryId: library.id,
                  relativePath: '',
                  modifiedAt: null,
                }}
                variant="grid"
                size={120}
              />
            </GridCard>
          ))}
        </GridContainer>
      </section>
      <section>
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
