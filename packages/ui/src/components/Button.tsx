import { Button as BaseUIButton } from '@base-ui/react/button'
import { css } from 'inline-css-modules'
import { styles as surfaceStyles } from './Surface.js'
import { clsx } from 'clsx';

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

export default function Button(props: { children: React.ReactNode }) {
  return (
    <BaseUIButton {...props} className={clsx(styles.button, surfaceStyles.surface)}>
      {props.children}
    </BaseUIButton>
  )
}
