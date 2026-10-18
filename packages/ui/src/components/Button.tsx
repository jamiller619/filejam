import { Button as BaseUIButton } from '@base-ui/react/button'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { ComponentProps } from 'react'

const styles = css`
  .button {
    color: var(--suzy-text);
    background: var(--suzy-gray-4);
    border-radius: var(--suzy-radius-3);
    corner-shape: var(--suzy-corner-shape);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &:hover {
      background: var(--suzy-gray-5);
    }
    &:active:not([data-disabled]) {
      background-color: var(--suzy-gray-6);
    }

    /* Also applies to non-native buttons, such as links. */
    &[data-disabled] {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }
  }

  .ghost {
    background: transparent;
    border: none;
  }
`

type ButtonProps = ComponentProps<typeof BaseUIButton> & {
  variant?: 'default' | 'ghost'
}

export default function Button({ variant = 'default', ...props }: ButtonProps) {
  return (
    <BaseUIButton
      {...props}
      className={clsx(styles.button, variant === 'ghost' && styles.ghost)}
    >
      {props.children}
    </BaseUIButton>
  )
}
