import {
  Input as BaseUIInput,
  type InputProps as BaseUIInputProps,
} from '@base-ui/react/input'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { Size } from './@types.js'
import Icon, { type IconName } from './Icon/index.js'

const styles = css`
  .root {
    position: relative;
    display: inline-grid;
    max-width: 100%;
  }

  .icon {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: var(--suzy-control-padding-x);
    z-index: 1;
    color: var(--suzy-text-muted);
    pointer-events: none;
    transform: translateY(-50%);
  }

  .small {
    min-height: 24px;
    padding-block: 0;
  }
`

export type InputProps = Omit<BaseUIInputProps, 'size'> & {
  icon?: IconName
  size?: Size
}

/** A text input with an optional decorative leading icon. */
export default function Input({
  icon,
  size = 'md',
  className,
  ...props
}: InputProps) {
  const cssClassName = clsx(
    styles.input,
    size === 'sm' && styles.small,
    className,
  )

  if (!icon) {
    return <BaseUIInput {...props} className={cssClassName} />
  }

  return (
    <span className={styles.root}>
      <Icon className={styles.icon} name={icon} size={14} />
      <BaseUIInput {...props} className={cssClassName} />
    </span>
  )
}
