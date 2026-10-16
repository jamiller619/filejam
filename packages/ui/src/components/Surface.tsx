import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react'

export const styles = css`
  .surface {
    background: var(--suzy-surface);
    backdrop-filter: blur(24px);
  }
`

export default function Surface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx(styles.surface, className)} />
}
