import { Tabs as BaseUITabs } from '@base-ui/react'
import { clsx } from 'clsx';
import { css } from 'inline-css-modules'

type TabsProps = BaseUITabs.Root.Props

const styles = css`
  .root {
    width: 100%;
  }

  .list {
    display: flex;
    position: relative;
    z-index: 1;
  }

  .tab {
    flex: 1;
    border-radius: var(--suzy-radius-full);
    text-align: center;
    padding-block: var(--suzy-space-2);
  }
`

export default function Tabs() { }

Tabs.Container = ({ children, ...props }: TabsProps) => {
  return (
    <BaseUITabs.Root {...props}>
      <BaseUITabs.List>
        {children}
      </BaseUITabs.List>
    </BaseUITabs.Root>
  )
}

Tabs.Tab = ({ children, className, ...props }: BaseUITabs.Tab.Props) => {
  return (
    <BaseUITabs.Tab {...props} className={clsx(styles.tab, className)}>
      {children}
    </BaseUITabs.Tab>
  )
}

Tabs.Panel = ({ children, className, ...props }: BaseUITabs.Panel.Props) => {
  return (
    <BaseUITabs.Panel {...props} className={clsx(styles.panel, className)}>{children}</BaseUITabs.Panel>
  )
}
