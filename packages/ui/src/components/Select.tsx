import { css } from 'inline-css-modules'
import { createContext, type ReactNode, useContext } from 'react'
import Icon from './Icon.js'
import Menu, { MenuItem } from './Menu.js'

const styles = css`
  .setting {
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
  children,
}: SelectProps) {
  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div className={styles.setting}>
        <span>{label}</span>
        <Menu
          label={label}
          triggerVariant="text"
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
