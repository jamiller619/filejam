import { Button as BaseUIButton } from '@base-ui/react/button'
import { css } from 'inline-css-modules'

const styles = css`
  .button {
    color: var(--text);
  }
`

export default function Button(props: { children: React.ReactNode }) {
  return (
    <BaseUIButton {...props} className={styles.button}>
      {props.children}
    </BaseUIButton>
  )
}
