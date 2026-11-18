import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import { motion } from 'motion/react'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { pressed } from '../interactions.js'
import { MenuSubmenu, styles } from './Menu.js'

type MenuEntry = {
  id?: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

export type ContextMenuItem =
  | (MenuEntry & { onClick: () => void; children?: never; type?: never })
  | (MenuEntry & {
      children: readonly ContextMenuItem[]
      onClick?: never
      type?: never
    })
  | { type: 'divider'; id: string }

export type ContextMenuProps = {
  trigger: ReactElement
  items: readonly ContextMenuItem[]
}

const MotionItem = motion.create(BaseContextMenu.Item)

function MenuItems({ items }: Pick<ContextMenuProps, 'items'>) {
  return items.map((item) => {
    if (item.type === 'divider') {
      return (
        <BaseContextMenu.Separator key={item.id} className={styles.separator} />
      )
    }

    const content = (
      <>
        <span className={styles.itemIndicator} aria-hidden="true">
          {item.icon}
        </span>
        <span className={styles.itemLabel}>{item.label}</span>
      </>
    )

    if (item.children) {
      return (
        <MenuSubmenu
          key={item.id ?? item.label}
          label={item.label}
          icon={item.icon}
          disabled={item.disabled}
        >
          <MenuItems items={item.children} />
        </MenuSubmenu>
      )
    }

    return (
      <MotionItem
        key={item.id ?? item.label}
        className={styles.item}
        whileTap={pressed}
        disabled={item.disabled}
        onClick={item.onClick}
      >
        {content}
      </MotionItem>
    )
  })
}

export default function ContextMenu({ trigger, items }: ContextMenuProps) {
  return (
    <BaseContextMenu.Root disabled={items.length === 0}>
      <BaseContextMenu.Trigger render={trigger} />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className={styles.positioner}>
          <BaseContextMenu.Popup className={styles.popup}>
            <MenuItems items={items} />
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}

/** Define once outside render. The component must forward DOM props and its ref. */
export function withContextMenu<Props extends object>(
  Component: ComponentType<Props>,
  items:
    | readonly ContextMenuItem[]
    | ((props: Props) => readonly ContextMenuItem[]),
) {
  function WithContextMenu(props: Props) {
    return (
      <ContextMenu
        trigger={<Component {...props} />}
        items={typeof items === 'function' ? items(props) : items}
      />
    )
  }

  WithContextMenu.displayName = `withContextMenu(${Component.displayName ?? Component.name ?? 'Component'})`

  return WithContextMenu
}
