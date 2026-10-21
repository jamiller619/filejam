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
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--suzy-radius-full);
    background: transparent;
    cursor: pointer;
    &::before {
      position: absolute;
      width: calc(100% - var(--suzy-space-2));
      height: calc(100% - var(--suzy-space-1));
      border-radius: var(--suzy-radius-full);
      background: var(--suzy-gray-6);
      content: '';
      transition: background-color var(--suzy-duration-fast)
        var(--suzy-ease-standard);
    }
    &[data-checked]::before { background: var(--suzy-accent-8); }
    &[data-disabled] { opacity: 0.5; cursor: not-allowed; }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); outline-offset: 2px; }
  }
  .thumb {
    position: absolute;
    top: var(--suzy-space-1);
    left: calc(var(--suzy-space-2) - 2px);
    display: block;
    width: calc(var(--suzy-control-height) - var(--suzy-space-4));
    height: calc(var(--suzy-control-height) - var(--suzy-space-4));
    border-radius: var(--suzy-radius-full);
    background: white;
    box-shadow: 0 1px 2px rgb(0 0 0 / 25%);
    transform: translateX(0);
    transition: transform var(--suzy-duration-fast) var(--suzy-ease-standard);
    [data-checked] & {
      transform: translateX(var(--suzy-space-4));
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
