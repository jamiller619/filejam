import { Menu as BaseMenu } from '@base-ui/react/menu'
import type { ReactNode } from 'react'
import { css } from 'inline-css-modules'

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
  .popup {
    z-index: 5;
    min-width: 180px;
    max-height: min(32rem, var(--available-height));
    overflow: auto;
    padding: var(--suzy-space-2);
    border: 1px solid var(--suzy-gray-5);
    border-radius: var(--suzy-radius-3);
    color: var(--text);
    background: var(--suzy-surface);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
  }
  .item, .checkboxItem, .submenuTrigger {
    display: flex;
    width: 100%;
    min-height: 32px;
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
    &[data-highlighted], &:hover { background: var(--suzy-gray-3); }
    &[data-disabled] { opacity: 0.5; cursor: default; }
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
    background: var(--suzy-surface);
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
  children,
}: {
  label: string
  trigger: ReactNode
  children: ReactNode
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        className={styles.trigger}
        aria-label={label}
        title={label}
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align="end">
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
        ✓
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </BaseMenu.CheckboxItem>
  )
}

export function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <BaseMenu.Item className={styles.item} onClick={onClick}>
      {children}
    </BaseMenu.Item>
  )
}
