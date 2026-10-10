import { css } from 'inline-css-modules'
import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

const styles = css`
  .pageLoader {
    display: flex;
    justify-content: center;
    padding: 4rem;
    background: var(--color-gray-2);
  }
`

function PageLoader() {
  return <div className={styles.pageLoader}>Loading...</div>
}

export default function SuspenseOutlet() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  )
}
