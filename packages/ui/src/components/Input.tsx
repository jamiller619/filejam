import {
  Input as BaseUIInput,
  type InputProps as BaseUIInputProps,
} from '@base-ui/react/input'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import Icon, { type IconName } from './Icon.js'

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

  .input {
    padding-inline-start: calc(var(--suzy-control-padding-x) + 20px);
    background: var(--suzy-gray-4);
    transition: background-color var(--suzy-duration-normal) var(--suzy-ease-standard);

    &:hover,
    &:focus {
      background: var(--suzy-gray-5);
    }
  }

  .small {
    min-height: 24px;
    padding-block: 0;
  }
`

export type InputProps = Omit<BaseUIInputProps, 'size'> & {
  icon?: IconName
  size?: 'medium' | 'small'
}

/** A text input with an optional decorative leading icon. */
export default function Input({
  icon,
  size = 'medium',
  className,
  ...props
}: InputProps) {
  const inputClassName = clsx(size === 'small' && styles.small, className)

  if (!icon) {
    return <BaseUIInput {...props} className={inputClassName} />
  }

  return (
    <span className={styles.root}>
      <Icon className={styles.icon} name={icon} size={14} />
      <BaseUIInput {...props} className={clsx(styles.input, inputClassName)} />
    </span>
  )
}
