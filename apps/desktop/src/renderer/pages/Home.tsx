import FilePreview from '../components/FilePreview.js'
import Files from '../components/Files.js'
import GridCard from '../components/GridCard.js'
import GridContainer from '../components/GridContainer.js'
import LibrariesToolbar from '../components/LibrariesToolbar.js'
import { useConfig } from '../hooks/useConfig.js'
import { useLibraries } from '../hooks/useLibraries.js'
import { folderDragProps } from '../utils/folderDrag.js'
import { folderUrl } from '../utils/folderUrl.js'
import { normalizePath } from '../utils/normalizePath.js'
import Page from './Page.js'

export default function Home() {
  const { libraries, loadFailed } = useLibraries()
  const userLibraries = libraries.filter((library) => !library.isTrash)
  const { values } = useConfig(['user.favoriteFolders'])
  const favoritePaths = values?.['user.favoriteFolders'] ?? []
  const favorites = favoritePaths.flatMap((path) => {
    const target = normalizePath(path)
    const library = userLibraries.find((item) => {
      const root = normalizePath(item.rootPath)

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
    const name = relativePath.split('/').filter(Boolean).at(-1) ?? library.name

    return [{ path, library, relativePath, name }]
  })

  return (
    <Page title="Home">
      <section>
        {loadFailed && <p role="status">Unable to load folders.</p>}
        <LibrariesToolbar />
        <GridContainer aria-label="Favorite folders">
          {favorites.map(({ path, library, relativePath, name }) => (
            <GridCard
              key={path}
              to={folderUrl({ libraryId: library.id, relativePath })}
              title={path}
              name={name}
              folderPath={path}
              {...folderDragProps(path)}
            >
              <FilePreview
                entry={{
                  libraryId: library.id,
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
