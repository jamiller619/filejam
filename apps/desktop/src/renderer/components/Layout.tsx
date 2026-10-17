import { ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { useMemo, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { DetailsPaneContext } from './DetailsPaneContext.js'
import Navbar from './Navbar.js'
import SuspenseOutlet from './SuspenseOutlet.js'
import Titlebar from './Titlebar.js'

const styles = css`
  .window {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;

    .navbar {
      background: lch(from var(--suzy-gray-2) l c h / 50%);
    }

    .layout {
      box-sizing: border-box;
      display: grid;
      grid-column: 1;
      grid-row: 1;
      grid-template-columns: 160px minmax(0, 1fr);
      grid-template-rows: 36px minmax(0, 1fr);
      height: 100%;
      min-width: 0;
      min-height: 0;

      &.withDetails {
        grid-template-columns: 160px 4px minmax(320px, 1fr) 4px minmax(260px, 380px);
      }

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
        grid-column: 2;
        grid-row: 2;
      }

      .content {
        grid-column: 3;
        grid-row: 1 / -1;
        display: grid;
        grid-template-rows: 36px minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        background: lch(from var(--suzy-gray-2) l c h / 90%);

        .titlebar {
          grid-row: 1;
          background: var(--suzy-gray-1);
          z-index: 1;
        }

        .page {
          grid-row: 2;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
      }

      .details {
        display: none;
        grid-column: 5;
        grid-row: 2;
        height: 100%;
        min-height: 0;
      }

      &.withDetails .details {
        display: block;
      }

      .detailsSeparator {
        display: none;
        grid-column: 4;
        grid-row: 2;
      }

      &.withDetails .detailsSeparator {
        display: block;
      }
    }
  }
`

export default function Layout() {
  const [detailsHost, setDetailsHost] = useState<HTMLDivElement | null>(null)
  const [detailsVisible, setDetailsVisible] = useState(false)
  const detailsPane = useMemo(
    () => ({ host: detailsHost, setVisible: setDetailsVisible }),
    [detailsHost],
  )

  return (
    <DetailsPaneContext value={detailsPane}>
      <div className={styles.window}>
        <Group
          className={`${styles.layout} ${detailsVisible ? styles.withDetails : ''}`}
        >
          <Panel className={`${styles.pane} ${styles.navigation}`} minSize={120} maxSize="30%">
            <Navbar className={styles.navbar} />
          </Panel>
          <Separator className={styles.navigationSeparator} />
          <Panel className={`${styles.pane} ${styles.content}`}>
            <Titlebar className={styles.titlebar} />
            <main className={styles.page}>
              <ScrollArea>
                <SuspenseOutlet />
              </ScrollArea>
            </main>
          </Panel>
          <Separator className={styles.detailsSeparator} />
          <div
            ref={setDetailsHost}
            className={`${styles.pane} ${styles.details}`}
          />
        </Group>
      </div>
    </DetailsPaneContext>
  )
}
