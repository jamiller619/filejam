import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { ComponentProps } from 'react'

const styles = css`
  .select {
    font: inherit;
    color: var(--suzy-text);
    background: var(--suzy-gray-4);
    border: 0;
    border-radius: var(--suzy-radius-3);
    min-height: 32px;
    max-width: 100%;
    padding: var(--suzy-space-1) var(--suzy-space-2);
    &:hover { background: var(--suzy-gray-5); }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); outline-offset: 2px; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
`

export type SelectProps = ComponentProps<'select'>

/** A native select with shared styling and platform keyboard behavior. */
export default function Select({ className, ...props }: SelectProps) {
  return <select {...props} className={clsx(styles.select, className)} />
}
