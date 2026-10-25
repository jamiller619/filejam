import { css } from 'inline-css-modules'

const styles = css`
  .container {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .error {
    margin-block: var(--suzy-space-2) 0;
    color: var(--suzy-red-11);
    font-size: var(--suzy-font-size-1);
  }
`

export default styles
