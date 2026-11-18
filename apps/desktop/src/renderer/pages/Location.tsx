import { useSearchParams } from 'react-router'
import Files from '../components/files/Files.js'
import PageHeader from '../components/layout/PageHeader.js'
import Page from './Page.js'

export default function Location() {
  const [params] = useSearchParams()
  const path = params.get('path')

  if (!path) {
    return <p role="status">Choose a location to browse.</p>
  }

  return (
    <Page
      title={path.split(/[\\/]/).filter(Boolean).at(-1) ?? path}
      split={{
        storageKey: path,
        content: (
          <Files
            path={path}
            preferencesScope="secondary"
            reportFolderStats={false}
          />
        ),
      }}
    >
      <PageHeader />
      <Files path={path} />
    </Page>
  )
}
