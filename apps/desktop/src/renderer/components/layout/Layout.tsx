import { css } from 'inline-css-modules'
import { useEffect, useRef } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Outlet } from 'react-router'
import { useSettings } from '../../hooks/useSettings.js'
import DetailsLayout from './DetailsLayout.js'
import Navbar from './Navbar.js'
import { SearchProvider } from './SearchContext.js'
import Titlebar from './Titlebar.js'

const styles = css`
  .window {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;

    --navbar-bg: lch(from var(--suzy-gray-2) l c h / 50%);

    .navbar {
      background: var(--navbar-bg);
    }

    .layout {
      --titlebar-height: 52px;

      position: relative;
      box-sizing: border-box;
      display: grid;
      grid-column: 1;
      grid-row: 1;
      grid-template-columns: 160px minmax(0, 1fr);
      grid-template-rows: var(--titlebar-height) minmax(0, 1fr);
      height: 100%;
      min-width: 0;
      min-height: 0;

      .pane {
        grid-row: 2;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }

      .navigation {
        grid-column: 1;
        grid-row: 1 / -1;
        overflow: auto;
      }

      .navigationSeparator {
        width: 4px;
        border-radius: var(--suzy-radius-full);
        background-color: var(--navbar-bg);
        transition: background-color var(--suzy-transition-duration) var(--suzy-transition-easing);

        &[data-separator='hover'],
        &[data-separator='active'] {
          background-color: var(--suzy-accent-9);
          transition-delay: 500ms;
        }
      }

      .content {
        grid-column: 3;
        grid-row: 1 / -1;
        display: grid;
        grid-template-rows: var(--titlebar-height) minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        background: lch(from var(--suzy-gray-2) l c h / 90%);

        .titlebar {
          grid-column: 1;
          grid-row: 1;
          padding-block: var(--suzy-space-2);
          z-index: 1;
        }

        .page {
          grid-row: 2;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

      }

    }
  }
`

export default function Layout() {
  const { values, updateSettings } = useSettings(['window.navbarWidth'])
  const saveNavbarTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(
    () => () => {
      clearTimeout(saveNavbarTimer.current)
    },
    [],
  )

  if (!values) {
    return null
  }

  return (
    <SearchProvider>
      <div className={styles.window}>
        <Group className={styles.layout}>
          <Panel
            className={`${styles.pane} ${styles.navigation}`}
            defaultSize={values['window.navbarWidth']}
            minSize={120}
            maxSize={250}
            onResize={({ inPixels }) => {
              clearTimeout(saveNavbarTimer.current)
              saveNavbarTimer.current = setTimeout(() => {
                void updateSettings('window.navbarWidth', Math.round(inPixels))
              }, 3000)
            }}
          >
            <Navbar className={styles.navbar} />
          </Panel>
          <Separator className={styles.navigationSeparator} />
          <Panel className={`${styles.pane} ${styles.content}`}>
            <Titlebar className={styles.titlebar} />
            <DetailsLayout>
              <Outlet />
            </DetailsLayout>
          </Panel>
        </Group>
      </div>
    </SearchProvider>
  )
}
