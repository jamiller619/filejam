import { Surface } from '@filejam/ui'
import { css } from 'inline-css-modules'
import type { CSSProperties, ReactNode } from 'react'

const styles = css`
  .surface {
    padding-block-end: var(--suzy-space-2);
    border-radius: var(--suzy-radius-4);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--card-size), 100%), 1fr));
    gap: var(--suzy-space-2);
    padding: 0;
    margin: 0;
    list-style: none;
  }
`

type GridContainerProps = {
  children: ReactNode
  'aria-label': string
  cardSize?: number
}

export default function GridContainer({
  children,
  'aria-label': label,
  cardSize = 150,
}: GridContainerProps) {
  const style = { '--card-size': `${cardSize}px` } as CSSProperties

  return (
    <Surface className={styles.surface}>
      <ul className={styles.grid} style={style} aria-label={label}>
        {children}
      </ul>
    </Surface>
  )
}
