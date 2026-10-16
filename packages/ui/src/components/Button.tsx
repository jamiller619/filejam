import { Button as BaseUIButton } from '@base-ui/react/button'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { ComponentProps } from 'react'
import { styles as surfaceStyles } from './Surface.js'

const styles = css`
  .button {
    color: var(--text);
    &:hover {
      background: var(--hover);
    }
    &:active:not([data-disabled]) {
      background-color: var(--selected);
    }
  }
`

export default function Button(props: ComponentProps<typeof BaseUIButton>) {
  return (
    <BaseUIButton
      {...props}
      className={clsx(styles.button, surfaceStyles.surface)}
    >
      {props.children}
    </BaseUIButton>
  )
}
