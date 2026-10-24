import { useParams } from 'react-router'
import Files from '../components/files/Files.js'
import { useCollections } from '../hooks/useCollections.js'
import Page from './Page.js'

export default function Collection() {
  const { collectionId = '' } = useParams()
  const { collections, loading, loadFailed } = useCollections()
  const collection = collections.find((item) => item.id === collectionId)

  if (loadFailed) {
    return <p role="status">Unable to load collection.</p>
  }

  if (loading) {
    return <p role="status">Loading collection…</p>
  }

  if (!collection) {
    return <p role="status">Collection not found.</p>
  }

  const { name } = collection

  return (
    <Page
      title={name}
      split={{
        storageKey: JSON.stringify(['collection', collectionId]),
        content: (
          <Files
            collectionId={collectionId}
            preferencesScope="secondary"
            reportFolderStats={false}
          />
        ),
      }}
    >
      <Files collectionId={collectionId} />
    </Page>
  )
}
