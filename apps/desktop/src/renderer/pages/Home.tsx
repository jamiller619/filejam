import FilePreview from '../components/files/FilePreview.js'
import Files from '../components/files/Files.js'
import GridCard from '../components/files/GridCard.js'
import GridContainer from '../components/files/GridContainer.js'
import PageHeader from '../components/layout/PageHeader.js'
import { useLocations } from '../hooks/useLocations.js'
import { useSettings } from '../hooks/useSettings.js'
import { folderDragProps } from '../utils/folderDrag.js'
import { locationUrl } from '../utils/folderUrl.js'
import Page from './Page.js'

export default function Home() {
  const { data: locations, loadFailed } = useLocations()
  const { values } = useSettings(['user.favoriteFolders'])
  const favorites = values?.['user.favoriteFolders'] ?? []

  return (
    <Page title="Home">
      <section>
        <PageHeader />
        <GridContainer aria-label="Favorite folders">
          {favorites.map((path) => (
            <GridCard
              key={path}
              to={locationUrl(path)}
              name={path.split(/[\\/]/).filter(Boolean).at(-1) ?? path}
              title={path}
              {...folderDragProps(path)}
            >
              <FilePreview
                entry={{
                  libraryId: 0,
                  relativePath: path,
                  modifiedAt: null,
                  kind: 'directory',
                }}
                variant="grid"
                size="100%"
              />
            </GridCard>
          ))}
        </GridContainer>
      </section>
      <section>
        {loadFailed && <p role="status">Unable to load locations.</p>}
        {locations && <Files path={locations.home} />}
      </section>
    </Page>
  )
}
