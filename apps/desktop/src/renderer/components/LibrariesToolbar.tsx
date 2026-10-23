import { css } from 'inline-css-modules'
import AddLibrary from './buttons/AddLibrary.js'

const styles = css`
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--suzy-space-3);
    padding-block: var(--suzy-space-2);
    padding-inline-end: calc(var(--scrollbar-size, 10px) + var(--suzy-space-2));
  }
`

export default function LibrariesToolbar() {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Library actions">
      <AddLibrary />
    </div>
  )
}
