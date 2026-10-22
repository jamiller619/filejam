import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'
import { pressed } from '../interactions.js'
import Icon from './Icon.js'

const styles = css`
  .wrapper {
    position: relative;
    display: inline-grid;
    max-width: 100%;
  }
  .select {
    appearance: none;
    font: inherit;
    color: var(--suzy-text);
    background: var(--suzy-gray-4);
    border: 0;
    border-radius: var(--suzy-radius-3);
    min-height: 32px;
    max-width: 100%;
    padding: var(--suzy-space-1) calc(var(--suzy-space-2) + 14px)
      var(--suzy-space-1) var(--suzy-space-2);
    &:hover { background: var(--suzy-gray-5); }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); outline-offset: 2px; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
  .icon {
    position: absolute;
    top: 50%;
    right: var(--suzy-space-2);
    pointer-events: none;
    transform: translateY(-50%) rotate(180deg);
  }
  .select:disabled + .icon {
    opacity: 0.5;
  }
`

const MotionSelect = motion.select

export type SelectProps = ComponentProps<typeof MotionSelect>

/** A native select with shared styling and platform keyboard behavior. */
export default function Select({ className, ...props }: SelectProps) {
  return (
    <span className={styles.wrapper}>
      <MotionSelect
        {...props}
        className={clsx(styles.select, className)}
        whileTap={pressed}
      />
      <Icon className={styles.icon} name="chevron-up" size={10} />
    </span>
  )
}
