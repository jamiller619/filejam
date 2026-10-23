import { Button as BaseUIButton } from '@base-ui/react/button'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'
import { pressed } from '../interactions.js'

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
    transition: background var(--suzy-duration-normal) var(--suzy-ease-standard);

    &:hover {
      background: lch(from var(--suzy-gray-8) l c h / 20%);
    }
    &:active:not([data-disabled]) {
      background: var(--suzy-gray-6);
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
      /* background: lch(from var(--suzy-action) l c h / 50%); */
      /* background: var(--suzy-action-hover); */
    }
    &:active:not([data-disabled]) {
      background: var(--suzy-action-active);
    }
  }
`

const MotionButton = motion.create(BaseUIButton)

type ButtonProps = ComponentProps<typeof MotionButton> & {
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
    <MotionButton
      {...props}
      whileTap={pressed}
      className={clsx(
        styles.button,
        color === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        className,
      )}
    >
      {props.children}
    </MotionButton>
  )
}
