import clsx from 'clsx'
import { css } from 'inline-css-modules'
import type { ComponentPropsWithRef } from 'react'

const styles = css`
  .pill {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    box-sizing: border-box;
    padding: var(--suzy-space-1) var(--suzy-space-2);
    border-radius: 999px;
    background: var(--suzy-gray-4);
    color: var(--suzy-text);
    font-size: var(--suzy-font-size-1);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`

export type PillProps = ComponentPropsWithRef<'span'>

export default function Pill({ className, ...props }: PillProps) {
  return <span {...props} className={clsx(styles.pill, className)} />
}
