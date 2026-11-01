import { Button as BaseUIButton } from '@base-ui/react/button'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { motion } from 'motion/react'
import type { ComponentProps, ElementType } from 'react'
import { pressed } from '../interactions.js'
import type { PolymorphicProps } from '../polymorphic.js'
import Surface, { type Size, type SurfaceOwnProps } from './Surface.js'

export type Variant = 'default' | 'ghost' | 'primary' | 'link'

const styles = css`
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 0;
    white-space: nowrap;
    gap: var(--suzy-space-2);
    line-height: 1;

    &.sm {
      min-height: 24px;
      padding: 0 var(--suzy-space-2);
      font-size: var(--suzy-font-size-1);
    }

    &.lg {
      height: 40px;
      padding: 0 var(--suzy-space-4);
      font-size: var(--suzy-font-size-3);
    }

    &.block {
      width: 100%;
    }

    &.variant-ghost {
      background: transparent;
    }

    &.variant-primary {
      color: var(--suzy-accent-1);
      background: var(--suzy-accent-9);

      &:hover {
        background: lch(from var(--suzy-accent-9) 100% c h);
      }
      &:active:not([data-disabled]) {
        background: var(--suzy-accent-11);
      }
    }

    &.variant-link {
      background: transparent;
      text-decoration: none;
      color: inherit;
      backdrop-filter: none;
    }
  }
`

const MotionButton = motion.create(BaseUIButton)
const motionProps: Pick<ComponentProps<typeof MotionButton>, 'whileTap'> = {
  whileTap: pressed,
}

export type ButtonProps<T extends ElementType = typeof MotionButton> =
  PolymorphicProps<
    T,
    SurfaceOwnProps & {
      color?: string
      size?: Size
      block?: boolean
      variant?: Variant
    }
  >

export default function Button<T extends ElementType = typeof MotionButton>({
  color = 'gray',
  variant = 'default',
  size = 'md',
  block = false,
  className,
  ...props
}: ButtonProps<T>) {
  return (
    <Surface<ElementType>
      as={MotionButton}
      {...props}
      {...motionProps}
      variant={variant}
      className={clsx(
        styles.button,
        size === 'sm' && styles.sm,
        size === 'md' && styles.md,
        size === 'lg' && styles.lg,
        variant && styles[`variant-${variant}`],
        block && styles.block,
        className,
      )}
    >
      {props.children}
    </Surface>
  )
}
