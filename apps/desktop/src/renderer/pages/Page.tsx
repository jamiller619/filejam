import { css } from 'inline-css-modules'

const styles = css`
  .header {
    display: flex;
    justify-content: space-between;
    padding-block: var(--suzy-space-3);
    background: var(--color-gray-2);
  }
`

type PageProps = {
  title: string
  children?: React.ReactNode
}

export default function Page({ children }: PageProps) {
  return (
    <div>
      <header className={styles.header}>
        {/* <h2>{title}</h2> */}
      </header>
      {children}
    </div>
  )
}
