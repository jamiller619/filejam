import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ComponentPropsWithRef } from 'react'

const styles = css`
  .eyebrow {
    color: lch(from var(--suzy-gray-11) l c h / 75%);
    font-size: var(--suzy-font-size-1);
    font-weight: 600;
    line-height: 1.5;
    /* letter-spacing: 0.07em; */
  }
`

export type EyebrowProps = ComponentPropsWithRef<'div'>

export default function Eyebrow({ className, ...props }: EyebrowProps) {
  return <div {...props} className={clsx(styles.eyebrow, className)} />
}
