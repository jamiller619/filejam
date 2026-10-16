import { useParams, useSearchParams } from 'react-router-dom'
import Files, { type Folder } from '../components/Files.js'
import { useLibraries } from '../hooks/useLibraries.js'
import Page from './Page.js';

export default function Library({
  folder: suppliedFolder,
}: {
  folder?: Folder
}) {
  const { libraryId } = useParams()
  const [searchParams] = useSearchParams()
  const { libraries, loadFailed, loading } = useLibraries()
  const folder = suppliedFolder ?? {
    libraryId: Number(libraryId),
    relativePath: searchParams.get('folder') ?? '',
  }
  const library = libraries.find((item) => item.id === folder.libraryId)
  const segments = folder.relativePath.split('/').filter(Boolean)

  if (!Number.isSafeInteger(folder.libraryId) || folder.libraryId <= 0) {
    return <p role="status">Invalid library.</p>
  }
  if (loadFailed) return <p role="status">Unable to load library.</p>
  if (loading) return <p role="status">Loading library…</p>
  if (!library) return <p role="status">Library not found.</p>

  return (
    <Page title={segments.at(-1) ?? library.name}>
      <Files folder={folder} />
    </Page>
  )
}
