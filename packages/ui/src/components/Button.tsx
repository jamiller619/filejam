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

  .primary {
    color: var(--suzy-action-text);
    background: var(--suzy-action);

    &:hover {
      background: var(--suzy-action-hover);
    }
    &:active:not([data-disabled]) {
      background: var(--suzy-action-active);
    }
  }
`

type ButtonProps = ComponentProps<typeof BaseUIButton> & {
  color?: 'gray' | 'primary'
  variant?: 'default' | 'ghost'
}

export default function Button({
  color = 'gray',
  variant = 'default',
  className,
  ...props
}: ButtonProps) {
  return (
    <BaseUIButton
      {...props}
      className={clsx(
        styles.button,
        color === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        className,
      )}
    >
      {props.children}
    </BaseUIButton>
  )
}
