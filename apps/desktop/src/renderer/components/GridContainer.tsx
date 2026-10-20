import { Surface } from '@files/ui'
import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'

const styles = css`
  .surface {
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
    gap: var(--suzy-space-1);
    padding: 0;
    margin: 0;
    list-style: none;
  }
`

type GridContainerProps = {
  children: ReactNode
  'aria-label': string
}

export default function GridContainer({
  children,
  'aria-label': label,
}: GridContainerProps) {
  return (
    <Surface className={styles.surface}>
      <ul className={styles.grid} aria-label={label}>
        {children}
      </ul>
    </Surface>
  )
}
