import { Menu as BaseMenu } from '@base-ui/react/menu'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'
import Icon from './Icon.js'

const styles = css`
  .trigger {
    display: grid;
    width: 32px;
    height: 32px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--suzy-radius-3);
    color: inherit;
    background: transparent;
    cursor: pointer;
    &:hover, &[data-popup-open] { background: var(--suzy-gray-3); }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); }
  }
  .textTrigger {
    display: inline-flex;
    width: auto;
    align-items: center;
    justify-content: center;
    padding-inline: var(--suzy-space-2);
    gap: var(--suzy-space-1);
    font: inherit;
    white-space: nowrap;
    background: var(--suzy-gray-4);
    &:hover, &[data-popup-open] { background: var(--suzy-gray-5); }
  }
  .positioner {
    z-index: var(--suzy-z-dropdown);
  }
  .popup {
    z-index: 5;
    min-width: 180px;
    max-height: min(32rem, var(--available-height));
    overflow: auto;
    padding: 2px;
    border: 1px solid var(--suzy-gray-5);
    border-radius: var(--suzy-radius-3);
    color: var(--text);
    background: var(--suzy-gray-5);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  }
  .item, .checkboxItem, .submenuTrigger {
    display: flex;
    width: 100%;
    height: 28px;
    box-sizing: border-box;
    align-items: center;
    gap: var(--suzy-space-2);
    padding: var(--suzy-space-2);
    border: 0;
    border-radius: var(--suzy-radius-2);
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
    &[data-highlighted], &:hover {
      background: lch(from var(--suzy-gray-11) l c h / 20%);
    }
    &[aria-current='true'] {
      color: var(--suzy-accent-1);
      background: var(--suzy-accent-9);
    }
    &[data-disabled] { opacity: 0.5; cursor: default; }
  }
  .itemIndicator {
    display: grid;
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    place-items: center;
  }
  .submenuTrigger { justify-content: space-between; }
  .submenuPopup {
    z-index: 6;
    min-width: 190px;
    max-height: min(32rem, var(--available-height));
    overflow: auto;
    padding: var(--suzy-space-2);
    border: 1px solid var(--suzy-gray-5);
    border-radius: var(--suzy-radius-3);
    color: var(--text);
    background: var(--suzy-gray-5);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  }
  .checkboxItem { justify-content: flex-start; }
  .checkboxIndicator {
    display: grid;
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    place-items: center;
  }
`

export function Menu({
  label,
  trigger,
  triggerVariant = 'icon',
  children,
}: {
  label: string
  trigger: ReactNode
  triggerVariant?: 'icon' | 'text'
  children: ReactNode
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        className={clsx(
          styles.trigger,
          triggerVariant === 'text' && styles.textTrigger,
        )}
        aria-label={label}
        title={label}
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className={styles.positioner}
          side="bottom"
          align="start"
          sideOffset={2}
        >
          <BaseMenu.Popup className={styles.popup}>{children}</BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export function MenuSubmenu({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger className={styles.submenuTrigger}>
        {label}
        <span aria-hidden="true">›</span>
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner>
          <BaseMenu.Popup className={styles.submenuPopup}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
  )
}

export function MenuCheckboxItem({
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <BaseMenu.CheckboxItem
      className={styles.checkboxItem}
      checked={checked}
      disabled={disabled}
      closeOnClick={false}
      onCheckedChange={onCheckedChange}
    >
      <BaseMenu.CheckboxItemIndicator className={styles.checkboxIndicator}>
        <Icon name="checkmark" size={14} />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  )
}

export function MenuItem({
  children,
  onClick,
  selected = false,
}: {
  children: ReactNode
  onClick?: () => void
  selected?: boolean
}) {
  return (
    <BaseMenu.Item
      className={styles.item}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span className={styles.itemIndicator} aria-hidden="true">
        {selected ? <Icon name="checkmark" size={14} /> : null}
      </span>
      {children}
    </BaseMenu.Item>
  )
}
