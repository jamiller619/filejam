import { css } from 'inline-css-modules'

export const fileSelectionStyles = css`
  .selectable[data-selected='true'] {
    --file-selection-background: var(--suzy-accent-9);
    --file-selection-color: var(--suzy-accent-1);
    color: var(--suzy-accent-1);

    [data-extension-color] { --file-name-color: var(--suzy-accent-1); }
    [data-value-color] { color: var(--suzy-accent-1); }
  }
`
