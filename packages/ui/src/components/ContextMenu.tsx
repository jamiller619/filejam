import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import { motion } from 'motion/react'
import {
  type ComponentType,
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useRef,
} from 'react'
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

export const ContextMenuInspector = createContext<
  ((x: number, y: number) => void) | undefined
>(undefined)

const MotionItem = motion.create(BaseContextMenu.Item)

function visibleItems(items: readonly ContextMenuItem[]): ContextMenuItem[] {
  const visible: ContextMenuItem[] = []
  let separator: ContextMenuItem | undefined

  for (const item of items) {
    if (item.type === 'divider') {
      if (visible.length) {
        separator ??= item
      }

      continue
    }

    if (item.disabled) {
      continue
    }

    let entry = item

    if (item.children) {
      const children = visibleItems(item.children)

      if (!children.length) {
        continue
      }

      entry = { ...item, children }
    }

    if (separator) {
      visible.push(separator)
      separator = undefined
    }

    visible.push(entry)
  }

  return visible
}

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
        onClick={item.onClick}
      >
        {content}
      </MotionItem>
    )
  })
}

export default function ContextMenu({ trigger, items }: ContextMenuProps) {
  const inspect = useContext(ContextMenuInspector)
  const position = useRef({ x: 0, y: 0 })
  const availableItems = visibleItems(items)

  if (inspect) {
    if (availableItems.length) {
      availableItems.push({ type: 'divider', id: 'inspect-divider' })
    }

    availableItems.push({
      id: 'inspect-element',
      label: 'Inspect Element',
      onClick: () => inspect(position.current.x, position.current.y),
    })
  }

  return (
    <BaseContextMenu.Root disabled={availableItems.length === 0}>
      <BaseContextMenu.Trigger
        render={trigger}
        onContextMenu={(event) => {
          position.current = { x: event.clientX, y: event.clientY }
        }}
      />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className={styles.positioner}>
          <BaseContextMenu.Popup className={styles.popup}>
            <MenuItems items={availableItems} />
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
