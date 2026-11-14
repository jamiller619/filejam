import { css } from 'inline-css-modules'

const styles = css<'control' | 'primary' | 'ghost'>`
  .control {
    --surface: var(--suzy-gray-10);
    --surface-opacity: 20%;
    --surface-hover-opacity: 30%;

    color: var(--suzy-text);
    background: lch(from var(--surface) l c h / var(--surface-opacity));
    transition: background var(--suzy-duration-fast) var(--suzy-ease-enter);

    &:hover,
    &:focus {
      background: lch(from var(--surface) l c h / var(--surface-hover-opacity));
    }

    &:active:not([data-disabled]):not(.ghost) {
      background: var(--suzy-gray-4);
    }

    &:focus-visible {
      outline: 2px solid var(--suzy-accent-8);
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

    &.ghost {
      background: transparent;
      border: none;

      &:hover {
        background: var(--suzy-gray-4);
      }
    }
  }
`

export default styles
