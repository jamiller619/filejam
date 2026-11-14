import { css } from 'inline-css-modules'
import Search from './Search.js'

const styles = css`
  .header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--suzy-space-3);
    padding-block: var(--suzy-space-2);
    padding-inline-end: calc(var(--scrollbar-size, 10px) + var(--suzy-space-2));
  }
`

export default function PageHeader() {
  return (
    <header className={styles.header}>
      <Search />
    </header>
  )
}
