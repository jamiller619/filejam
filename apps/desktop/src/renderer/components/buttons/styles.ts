import { css } from 'inline-css-modules'

const styles = css`
  .container {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .button {
    gap: var(--suzy-space-2);
    min-height: 32px;
    padding-inline: var(--suzy-space-3);
    border: 0;
    white-space: nowrap;
  }
  .error {
    margin-block: var(--suzy-space-2) 0;
    color: var(--suzy-red-11);
    font-size: var(--suzy-font-size-1);
  }
`

export default styles
