import { css } from 'inline-css-modules'

export const fileSelectionStyles = css`
  .selectable[data-selected='true'] {
    --file-selection-background: var(--suzy-accent-9);
    --file-selection-color: var(--suzy-accent-1);
    color: var(--suzy-accent-1);

    [data-extension-color] { --file-name-color: var(--suzy-accent-1); }
    [data-value-color] { color: var(--suzy-accent-1); }
  }

  .selectable[data-clipboard='copy'] {
    outline: 2px dashed var(--file-selection-color, var(--suzy-accent-9));
    outline-offset: -2px;
  }

  .selectable[data-clipboard='cut']:not([data-folder-dragging='true']) {
    opacity: 0.65;
  }
`
