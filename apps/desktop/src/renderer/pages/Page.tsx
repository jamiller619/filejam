import { css } from 'inline-css-modules'

const styles = css`
  .page {
    padding: var(--suzy-space-2);
  }
`

type PageProps = {
  title: string
  children?: React.ReactNode
}

export default function Page({ children }: PageProps) {
  return (
    <div className={styles.page}>
      {children}
    </div>
  )
}
