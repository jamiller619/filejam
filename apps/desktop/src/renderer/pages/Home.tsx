import FilePreview from '../components/files/FilePreview.js'
import Files from '../components/files/Files.js'
import GridCard from '../components/files/GridCard.js'
import GridContainer from '../components/files/GridContainer.js'
import { useLocations } from '../hooks/useLocations.js'
import { useSettings } from '../hooks/useSettings.js'
import { useVolumes } from '../hooks/useVolumes.js'
import { folderDragProps } from '../utils/folderDrag.js'
import { folderUrl } from '../utils/folderUrl.js'
import { normalizePath } from '../utils/normalizePath.js'
import Page from './Page.js'

export default function Home() {
  const { volumes, loadFailed } = useVolumes()
  const { locations } = useLocations()
  const userVolumes = volumes.filter((volume) => !volume.isTrash)
  const { values } = useSettings(['user.favoriteFolders'])
  const favoritePaths = values?.['user.favoriteFolders'] ?? []
  const favorites = favoritePaths.flatMap((path) => {
    const target = normalizePath(path)
    const volume = userVolumes
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
  const initialFolder =
    locations.find((location) => location.id === 'desktop') ??
    (userVolumes[0] && { volumeId: userVolumes[0].id, relativePath: '' })

  return (
    <Page title="Home">
      <section>
        {loadFailed && <p role="status">Unable to load folders.</p>}
        <GridContainer aria-label="Favorite folders">
          {favorites.map(({ path, volume, relativePath, name }) => (
            <GridCard
              key={path}
              to={folderUrl({ volumeId: volume.id, relativePath })}
              title={path}
              name={name}
              folderPath={path}
              {...folderDragProps(path)}
            >
              <FilePreview
                entry={{
                  volumeId: volume.id,
                  relativePath,
                  modifiedAt: null,
                }}
                variant="grid"
                size="100%"
              />
            </GridCard>
          ))}
        </GridContainer>
      </section>
      <section>
        {initialFolder ? (
          <Files folder={initialFolder} />
        ) : !loadFailed ? (
          <p role="status">No folder available.</p>
        ) : null}
      </section>
    </Page>
  )
}
