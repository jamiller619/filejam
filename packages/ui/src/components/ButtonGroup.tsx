import { clsx } from 'clsx';
import { css } from 'inline-css-modules'
import type { HTMLAttributes } from 'react';

const styles = css`
  .buttonGroup {
    display: flex;
    border-radius: var(--suzy-radius-4);
    overflow: hidden;
    outline: 2px solid var(--suzy-gray-4);
    outline-offset: -2px;
  }

  button {
    border-radius: 0;
  }
`

type ButtonGroupProps = HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode
}

export default function ButtonGroup({ children, className, ...props }: ButtonGroupProps) {
  return (
    <div className={clsx(styles.buttonGroup, className)} {...props}>
      {children}
    </div>
  )
}
