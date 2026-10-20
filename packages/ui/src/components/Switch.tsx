import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { css } from 'inline-css-modules'
import type { ComponentProps } from 'react'

const styles = css`
  .root {
    position: relative;
    display: inline-flex;
    width: calc(var(--suzy-control-height) + var(--suzy-space-3));
    height: calc(var(--suzy-control-height) - var(--suzy-space-2));
    min-height: calc(var(--suzy-control-height) - var(--suzy-space-2));
    flex: 0 0 calc(var(--suzy-control-height) + var(--suzy-space-3));
    align-items: center;
    padding: 2px;
    border: 0;
    border-radius: var(--suzy-radius-full);
    background: var(--suzy-gray-6);
    cursor: pointer;
    transition: background-color var(--suzy-duration-fast)
      var(--suzy-ease-standard);
    &[data-checked] { background: var(--suzy-accent-8); }
    &[data-disabled] { opacity: 0.5; cursor: not-allowed; }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); outline-offset: 2px; }
  }
  .thumb {
    display: block;
    width: calc(var(--suzy-control-height) - var(--suzy-space-3) - 2px);
    height: calc(var(--suzy-control-height) - var(--suzy-space-3) - 2px);
    border-radius: var(--suzy-radius-full);
    background: white;
    box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
    transform: translateX(0);
    transition: transform var(--suzy-duration-fast) var(--suzy-ease-standard);
    [data-checked] & {
      transform: translateX(
        calc(var(--suzy-space-5) - var(--suzy-space-1) + 2px)
      );
    }
  }
`

export type SwitchProps = ComponentProps<typeof BaseSwitch.Root>

export default function Switch({ className, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      {...props}
      className={[styles.root, className].filter(Boolean).join(' ')}
    >
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  )
}
