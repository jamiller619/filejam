import { css } from 'inline-css-modules'

const styles = css<'control' | 'primary'>`
  .control {
    color: var(--suzy-text);
    background: lch(from var(--suzy-gray-10) l c h / 10%);
    transition: background var(--suzy-duration-normal) var(--suzy-ease-standard);

    &:hover,
    &:focus {
      background: var(--suzy-gray-5);
    }

    &:active:not([data-disabled]) {
      background: var(--suzy-gray-6);
    }

    &[data-disabled] {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }

    &.primary {
      color: var(--suzy-accent-1);
      background: var(--suzy-accent-9);

      &:hover {
        background: lch(from var(--suzy-accent-9) 100% c h);
      }
      &:active:not([data-disabled]) {
        background: var(--suzy-accent-11);
      }
    }
  }
`

export default styles
