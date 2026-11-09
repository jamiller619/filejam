import { css } from 'inline-css-modules'
import {
  createContext,
  type FocusEventHandler,
  type ReactNode,
  useContext,
} from 'react'
import Icon from './Icon.js'
import Menu, { MenuItem } from './Menu.js'

const styles = css`
  .root {
    display: flex;
    align-items: center;
    gap: var(--suzy-space-2);
    white-space: nowrap;
  }
  .dropdownIcon {
    margin-inline-start: var(--suzy-space-1);
    transform: rotate(180deg);
  }
`

export type SelectProps = {
  label: string
  value: string | null
  displayValue: ReactNode
  onValueChange: (value: string | null) => void
  disabled?: boolean | undefined
  title?: string | undefined
  onFocus?: FocusEventHandler<HTMLButtonElement> | undefined
  children: ReactNode
}

export type SelectMenuItemProps = {
  value: string | null
  children: ReactNode
}

const SelectContext = createContext<Pick<
  SelectProps,
  'value' | 'onValueChange'
> | null>(null)

function SelectMenuItem({ value, children }: SelectMenuItemProps) {
  const select = useContext(SelectContext)

  if (!select) {
    throw new Error('Select.MenuItem must be rendered inside Select.')
  }

  return (
    <MenuItem
      selected={select.value === value}
      onClick={() => select.onValueChange(value)}
    >
      {children}
    </MenuItem>
  )
}

function DropdownIcon() {
  return <Icon className={styles.dropdownIcon} name="chevron-up" size={12} />
}

export default function Select({
  label,
  value,
  displayValue,
  onValueChange,
  disabled,
  title,
  onFocus,
  children,
}: SelectProps) {
  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div className={styles.root}>
        <span>{label}</span>
        <Menu
          label={label}
          triggerVariant="text"
          disabled={disabled}
          title={title}
          onFocus={onFocus}
          trigger={
            <>
              {displayValue}
              <DropdownIcon />
            </>
          }
        >
          {children}
        </Menu>
      </div>
    </SelectContext.Provider>
  )
}

Select.MenuItem = SelectMenuItem
