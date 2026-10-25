import { Button as BaseUIButton } from '@base-ui/react/button'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'
import { pressed } from '../interactions.js'
import controlStyles from './Control.module.js'

const styles = css`
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 0;
    white-space: nowrap;
    gap: var(--suzy-space-2);
  }

  .ghost {
    background: transparent;
    border: none;
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
        controlStyles.control,
        styles.button,
        color === 'primary' && controlStyles.primary,
        variant === 'ghost' && styles.ghost,
        className,
      )}
    >
      {props.children}
    </MotionButton>
  )
}
