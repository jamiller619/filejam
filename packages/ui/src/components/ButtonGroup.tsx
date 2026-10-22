import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { motion } from 'motion/react'
import type { ComponentProps } from 'react'
import { pressed } from '../interactions.js'
import { ButtonGroupContext } from './ButtonGroupContext.js'

const styles = css`
  .buttonGroup {
    display: flex;
    border-radius: var(--suzy-radius-4);
    overflow: hidden;
    outline: 2px solid var(--suzy-gray-4);
    background: var(--suzy-gray-2);

    button {
      width: 28px;
      height: 28px;
      min-height: 28px;
      padding: 0;
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

type ButtonGroupProps = ComponentProps<typeof motion.div> & {
  children?: React.ReactNode
}

export default function ButtonGroup({
  children,
  className,
  ...props
}: ButtonGroupProps) {
  return (
    <ButtonGroupContext value={true}>
      <motion.div
        className={clsx(styles.buttonGroup, className)}
        whileTap={pressed}
        {...props}
      >
        {children}
      </motion.div>
    </ButtonGroupContext>
  )
}
