import { ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useConfig } from '../hooks/useConfig.js'
import { DetailsPaneContext } from './DetailsPaneContext.js'
import Navbar from './Navbar.js'
import { PageFooterHostContext } from './PageFooterContext.js'
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
      position: relative;
      box-sizing: border-box;
      display: grid;
      grid-column: 1;
      grid-row: 1;
      grid-template-columns: 160px minmax(0, 1fr);
      grid-template-rows: 36px minmax(0, 1fr);
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
          grid-column: 1;
          grid-row: 1;
          background: lch(from var(--suzy-gray-2) l c h / 50%);
          backdrop-filter: blur(8px);
          z-index: 1;
        }

        .page {
          grid-row: 2;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        .pageContent {
          box-sizing: border-box;
          min-height: 100%;
          padding-block-start: 36px;
        }
      }

      .workspace {
        grid-column: 1;
        grid-row: 1 / -1;
        display: flex;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--suzy-gray-2);

        .page {
          display: grid;
          flex: 1;
          grid-row: auto;
          grid-template-rows: minmax(0, 1fr) auto;
        }

        .pageFooter:empty {
          display: none;
        }

        .details {
          --details-width: 380px;
          flex: 0 0 auto;
          width: 0;
          height: calc(100% - 36px);
          min-height: 0;
          margin-block-start: 36px;
          overflow: hidden;
        }
      }
    }
  }
`

export default function Layout() {
  const { values, updateConfig } = useConfig(['window.navbarWidth'])
  const saveNavbarTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [detailsHost, setDetailsHost] = useState<HTMLDivElement | null>(null)
  const [detailsVisible, setDetailsVisible] = useState(false)
  const [pageFooterHost, setPageFooterHost] = useState<HTMLDivElement | null>(
    null,
  )

  const detailsPane = useMemo(
    () => ({ host: detailsHost, setVisible: setDetailsVisible }),
    [detailsHost],
  )

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
    <DetailsPaneContext value={detailsPane}>
      <PageFooterHostContext value={pageFooterHost}>
        <div className={styles.window}>
          <Group
            className={styles.layout}
            data-details-visible={detailsVisible}
          >
            <Panel
              className={`${styles.pane} ${styles.navigation}`}
              defaultSize={values['window.navbarWidth']}
              minSize={120}
              maxSize={250}
              onResize={({ inPixels }) => {
                clearTimeout(saveNavbarTimer.current)
                saveNavbarTimer.current = setTimeout(() => {
                  void updateConfig('window.navbarWidth', Math.round(inPixels))
                }, 250)
              }}
            >
              <Navbar className={styles.navbar} />
            </Panel>
            <Separator className={styles.navigationSeparator} />
            <Panel className={`${styles.pane} ${styles.content}`}>
              <Titlebar className={styles.titlebar} />
              <div className={styles.workspace}>
                <main className={styles.page}>
                  <ScrollArea>
                    <div className={styles.pageContent}>
                      <SuspenseOutlet />
                    </div>
                  </ScrollArea>
                  <div ref={setPageFooterHost} className={styles.pageFooter} />
                </main>
                <div ref={setDetailsHost} className={styles.details} />
              </div>
            </Panel>
          </Group>
        </div>
      </PageFooterHostContext>
    </DetailsPaneContext>
  )
}
