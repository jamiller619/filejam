import { useParams, useSearchParams } from 'react-router'
import Files, { type Folder } from '../components/files/Files.js'
import { useVolumes } from '../hooks/useVolumes.js'
import Page from './Page.js'

export default function Browse({
  folder: suppliedFolder,
}: {
  folder?: Folder
}) {
  const { volumeId } = useParams()
  const [searchParams] = useSearchParams()
  const { volumes, loadFailed, loading } = useVolumes()
  const folder = suppliedFolder ?? {
    volumeId: Number(volumeId),
    relativePath: searchParams.get('path') ?? '',
  }
  const volume = volumes.find((item) => item.id === folder.volumeId)
  const segments = folder.relativePath.split('/').filter(Boolean)

  if (!Number.isSafeInteger(folder.volumeId) || folder.volumeId <= 0) {
    return <p role="status">Invalid folder location.</p>
  }

  if (loadFailed) {
    return <p role="status">Unable to load the volume.</p>
  }

  if (loading) {
    return <p role="status">Loading folder...</p>
  }

  if (!volume) {
    return <p role="status">Volume not found.</p>
  }

  return (
    <Page
      title={segments.at(-1) ?? volume.name}
      split={{
        storageKey: JSON.stringify([
          'folder',
          folder.volumeId,
          folder.relativePath,
        ]),
        content: (
          <Files
            folder={folder}
            preferencesScope="secondary"
            reportFolderStats={false}
          />
        ),
      }}
    >
      <Files folder={folder} />
    </Page>
  )
}
