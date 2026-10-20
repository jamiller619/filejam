import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react'

const styles = css`
  .buttonGroup {
    display: flex;
    border-radius: var(--suzy-radius-4);
    overflow: hidden;
    outline: 2px solid var(--suzy-gray-4);
    background: var(--suzy-gray-2);

    button {
      border-radius: 100px;
      corner-shape: round;
      background: transparent;
      margin: 1px;

      &[data-disabled] {
        background: transparent;
      }

      &[aria-pressed='true'] {
        background: var(--suzy-gray-6);
      }
    }
  }
`

type ButtonGroupProps = HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode
}

export default function ButtonGroup({
  children,
  className,
  ...props
}: ButtonGroupProps) {
  return (
    <div className={clsx(styles.buttonGroup, className)} {...props}>
      {children}
    </div>
  )
}
