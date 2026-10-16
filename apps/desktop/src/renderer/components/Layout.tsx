import { ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { useMemo, useState } from 'react'
import { DetailsPaneContext } from './DetailsPaneContext.js'
import Navbar from './Navbar.js'
import SuspenseOutlet from './SuspenseOutlet.js'
import Titlebar from './Titlebar.js'

const styles = css`
  .window {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    .layout {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 160px minmax(0, 1fr);
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: var(--suzy-space-2);

      &.withDetails {
        grid-template-columns: 160px minmax(320px, 1fr) minmax(260px, 380px);
      }

      .pane {
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }
      .navigation {
        overflow: auto;
      }
      .content {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        .page {
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
      }
      .details {
        display: none;
        height: 100%;
        min-height: 0;
      }

      &.withDetails .details {
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
        <Titlebar />
        <div
          className={`${styles.layout} ${detailsVisible ? styles.withDetails : ''}`}
        >
          <div className={`${styles.pane} ${styles.navigation}`}>
            <Navbar />
          </div>
          <div className={`${styles.pane} ${styles.content}`}>
            <main className={styles.page}>
              <ScrollArea>
                <SuspenseOutlet />
              </ScrollArea>
            </main>
          </div>
          <div
            ref={setDetailsHost}
            className={`${styles.pane} ${styles.details}`}
          />
        </div>
      </div>
    </DetailsPaneContext>
  )
}
