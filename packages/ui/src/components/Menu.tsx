import { Menu as BaseMenu } from '@base-ui/react/menu'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { motion } from 'motion/react'
import { type FocusEventHandler, type ReactNode, useRef } from 'react'
import { pressed } from '../interactions.js'
import Icon from './Icon/index.js'

const styles = css`
  .triggerAnchor {
    display: inline-flex;
    flex-shrink: 0;
    vertical-align: middle;
  }
  .submenuAnchor { display: flex; }
  .trigger {
    display: grid;
    width: 32px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--suzy-radius-3);
    background: transparent;
    cursor: pointer;

    &:hover, &[data-popup-open] {
      background: var(--suzy-gray-3);
    }
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

    &:hover, &[data-popup-open] {
      background: var(--suzy-gray-5);
    }
  }
  .positioner {
    z-index: var(--suzy-z-dropdown);
  }
  .popup {
    z-index: 5;
    min-width: 180px;
    max-height: min(32rem, var(--available-height));
    overflow: auto;
    padding: var(--suzy-space-1);
    border-radius: var(--suzy-radius-3);
    color: var(--text);
    background: var(--suzy-gray-5);
    box-shadow: 0 4px 16px rgb(0 0 0 / 18%);
    display: flex;
    flex-direction: column;
    gap: var(--suzy-space-1);
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

    &[data-disabled] {
      opacity: 0.5;
      cursor: default;
    }
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
  .checkboxItem {
    justify-content: flex-start;
  }
  .checkboxIndicator {
    display: grid;
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    place-items: center;
  }
`

const MotionMenuTrigger = motion.create(BaseMenu.Trigger)
const MotionMenuSubmenuTrigger = motion.create(BaseMenu.SubmenuTrigger)
const MotionMenuCheckboxItem = motion.create(BaseMenu.CheckboxItem)
const MotionMenuItem = motion.create(BaseMenu.Item)

export default function Menu({
  label,
  trigger,
  triggerVariant = 'icon',
  disabled,
  title = label,
  onFocus,
  children,
}: {
  label: string
  trigger: ReactNode
  triggerVariant?: 'icon' | 'text'
  disabled?: boolean | undefined
  title?: string | undefined
  onFocus?: FocusEventHandler<HTMLButtonElement> | undefined
  children: ReactNode
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)

  return (
    <BaseMenu.Root>
      {/* Keep popup measurements independent of the trigger's press animation. */}
      <span ref={anchorRef} className={styles.triggerAnchor}>
        <MotionMenuTrigger
          whileTap={pressed}
          className={clsx(
            styles.trigger,
            triggerVariant === 'text' && styles.textTrigger,
          )}
          aria-label={label}
          title={title}
          disabled={disabled}
          onFocus={onFocus}
        >
          {trigger}
        </MotionMenuTrigger>
      </span>
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          anchor={anchorRef}
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
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <BaseMenu.SubmenuRoot>
      <div ref={anchorRef} className={styles.submenuAnchor}>
        <MotionMenuSubmenuTrigger
          className={styles.submenuTrigger}
          whileTap={pressed}
        >
          {label}
          <span aria-hidden="true">›</span>
        </MotionMenuSubmenuTrigger>
      </div>
      <BaseMenu.Portal>
        <BaseMenu.Positioner anchor={anchorRef}>
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
    <MotionMenuCheckboxItem
      className={styles.checkboxItem}
      whileTap={pressed}
      checked={checked}
      disabled={disabled}
      closeOnClick={false}
      onCheckedChange={onCheckedChange}
    >
      <BaseMenu.CheckboxItemIndicator className={styles.checkboxIndicator}>
        <Icon name="check" size={14} />
      </BaseMenu.CheckboxItemIndicator>
      {children}
    </MotionMenuCheckboxItem>
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
    <MotionMenuItem
      className={styles.item}
      whileTap={pressed}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
    >
      <span className={styles.itemIndicator} aria-hidden="true">
        {selected ? <Icon name="check" size={14} /> : null}
      </span>
      {children}
    </MotionMenuItem>
  )
}
