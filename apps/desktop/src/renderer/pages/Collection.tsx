import { useParams } from 'react-router-dom'
import Files from '../components/Files.js'
import { useCollections } from '../hooks/useCollections.js'
import Page from './Page.js'

export default function Collection() {
  const { collectionId = '' } = useParams()

  return <CollectionContent key={collectionId} id={collectionId} />
}

function CollectionContent({ id }: { id: string }) {
  const { collections, loading, loadFailed } = useCollections()
  const collection = collections.find((item) => item.id === id)

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
    <Page title={name}>
      <Files collectionId={id} />
    </Page>
  )
}
