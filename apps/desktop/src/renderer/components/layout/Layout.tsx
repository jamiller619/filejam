import { css } from 'inline-css-modules'
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { Outlet, useLocation } from 'react-router'
import { useSettings } from '../../hooks/useSettings.js'
import { DetailsPaneContext } from './DetailsPaneContext.js'
import Navbar from './Navbar.js'
import { PageFooterHostContext } from './PageFooterContext.js'
import { SearchProvider } from './SearchContext.js'
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
      --titlebar-height: 48px;

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
        grid-column: 2;
        grid-row: 1 / -1;
        width: 4px;
        border-radius: var(--suzy-radius-full);
        background-color: lch(from var(--suzy-gray-2) l c h / 90%);
        transition: background-color 120ms ease;

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

      }

      .workspace {
        grid-column: 1;
        grid-row: 2;
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
          view-transition-name: page-content;
        }

        .pageFooter {
          :empty {
            display: none;
          }
        }

        .detailsSeparator {
          position: relative;
          z-index: 1;
          flex: 0 0 4px;
          width: 4px;
          margin: 0;
          padding: 0;
          border: 0;
          border-radius: var(--suzy-radius-full);
          background-color: var(--suzy-gray-2);
          cursor: ew-resize;
          touch-action: none;
          transition: background-color 120ms ease;

          &::before {
            position: absolute;
            inset-block: 0;
            inset-inline: -3px;
            content: '';
          }

          &:hover,
          &:focus-visible,
          &[data-resizing='true'] {
            background-color: var(--suzy-accent-9);
            transition-delay: 250ms;
          }

          &:focus-visible {
            outline: none;
          }

          &[hidden] {
            display: none;
          }
        }

        .details {
          flex: 0 0 auto;
          width: 0;
          height: calc(100% - 10px);
          min-height: 0;
          margin-block-start: 10px;
          overflow: hidden;
          border-top-left-radius: var(--suzy-radius-3);
          view-transition-name: file-details;

          &:has(> [data-details-pane]) {
            .detailsPlaceholder {
              display: none;
            }
          }

          .detailsPlaceholder {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            width: var(--details-width);
            height: 100%;
            color: var(--suzy-gray-12);
            background: var(--suzy-gray-4);
          }

          .detailsPlaceholderHeader {
            display: flex;
            flex: 0 0 auto;
            align-items: center;
            min-height: 28px;
            padding: var(--suzy-space-3);
          }

          .detailsPlaceholderTitle {
            margin: 0;
            font-size: var(--suzy-font-size-3);
            font-weight: 500;
          }

          .detailsPlaceholderBody {
            margin: 0;
            padding: 0 var(--suzy-space-3) var(--suzy-space-3);
            color: var(--suzy-gray-11);
          }
        }
      }
    }
  }
`

const minimumDetailsWidth = 280
const maximumDetailsWidth = 600
const detailsResizeStep = 10

type DetailsWidthStyle = CSSProperties & {
  '--details-width': string
}

export default function Layout() {
  const location = useLocation()
  const { values, updateSettings } = useSettings([
    'window.navbarWidth',
    'window.detailsWidth',
  ])
  const saveNavbarTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saveDetailsTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const detailsTransitionTimer =
    useRef<ReturnType<typeof setTimeout>>(undefined)
  const detailsVisibilityBatch = useRef<{
    from: boolean
    to: boolean
  } | null>(null)
  const detailsVisibleRef = useRef(true)
  const detailsDrag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const [detailsHost, setDetailsHost] = useState<HTMLDivElement | null>(null)
  const [detailsVisible, setDetailsVisible] = useState(true)
  const [resizedDetailsWidth, setResizedDetailsWidth] = useState<number | null>(
    null,
  )
  const [resizingDetails, setResizingDetails] = useState(false)
  const [pageFooterHost, setPageFooterHost] = useState<HTMLDivElement | null>(
    null,
  )
  const detailsWidth =
    resizedDetailsWidth ?? values?.['window.detailsWidth'] ?? 380
  const detailsWidthRef = useRef(detailsWidth)
  const setDetailsVisibility = useCallback((visible: boolean) => {
    const batch = detailsVisibilityBatch.current

    if (batch) {
      batch.to = visible
    } else {
      detailsVisibilityBatch.current = {
        from: detailsVisibleRef.current,
        to: visible,
      }

      queueMicrotask(() => {
        const completedBatch = detailsVisibilityBatch.current

        if (!completedBatch) {
          return
        }

        detailsVisibilityBatch.current = null
        detailsVisibleRef.current = completedBatch.to
        clearTimeout(detailsTransitionTimer.current)

        if (completedBatch.from === completedBatch.to) {
          delete document.documentElement.dataset.detailsTransition
          return
        }

        document.documentElement.dataset.detailsTransition = completedBatch.to
          ? 'enter'
          : 'exit'
        detailsTransitionTimer.current = setTimeout(() => {
          delete document.documentElement.dataset.detailsTransition
        }, 250)
      })
    }

    setDetailsVisible(visible)
  }, [])
  const detailsPane = useMemo(
    () => ({ host: detailsHost, setVisible: setDetailsVisibility }),
    [detailsHost, setDetailsVisibility],
  )

  detailsWidthRef.current = detailsWidth

  useEffect(
    () => () => {
      clearTimeout(saveNavbarTimer.current)
      clearTimeout(saveDetailsTimer.current)
      clearTimeout(detailsTransitionTimer.current)
      delete document.documentElement.dataset.detailsTransition
    },
    [],
  )

  useLayoutEffect(() => {
    void location.key
    setDetailsVisibility(true)
  }, [location.key, setDetailsVisibility])

  useLayoutEffect(() => {
    if (
      !detailsHost ||
      detailsHost.querySelector(':scope > [data-details-pane]')
    ) {
      return
    }

    detailsHost.style.width = detailsVisible ? `${detailsWidth}px` : '0px'
  }, [detailsHost, detailsVisible, detailsWidth])

  function setDetailsWidth(width: number) {
    const nextWidth = Math.round(
      Math.max(minimumDetailsWidth, Math.min(maximumDetailsWidth, width)),
    )

    detailsWidthRef.current = nextWidth
    setResizedDetailsWidth(nextWidth)

    if (detailsHost) {
      detailsHost.style.width = `${nextWidth}px`
    }
  }

  function saveDetailsWidth() {
    clearTimeout(saveDetailsTimer.current)
    saveDetailsTimer.current = setTimeout(() => {
      void updateSettings('window.detailsWidth', detailsWidthRef.current)
    }, 250)
  }

  function handleDetailsPointerDown(event: PointerEvent<HTMLHRElement>) {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.currentTarget.focus()
    detailsDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: detailsWidthRef.current,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizingDetails(true)
  }

  function handleDetailsPointerMove(event: PointerEvent<HTMLHRElement>) {
    const drag = detailsDrag.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    setDetailsWidth(drag.startWidth + drag.startX - event.clientX)
  }

  function finishDetailsResize(event: PointerEvent<HTMLHRElement>) {
    if (detailsDrag.current?.pointerId !== event.pointerId) {
      return
    }

    detailsDrag.current = null
    setResizingDetails(false)
    saveDetailsWidth()
  }

  function handleDetailsKeyDown(event: KeyboardEvent<HTMLHRElement>) {
    let nextWidth: number | undefined

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = detailsWidthRef.current + detailsResizeStep
        break
      case 'ArrowRight':
        nextWidth = detailsWidthRef.current - detailsResizeStep
        break
      case 'Home':
        nextWidth = minimumDetailsWidth
        break
      case 'End':
        nextWidth = maximumDetailsWidth
        break
    }

    if (nextWidth === undefined) {
      return
    }

    event.preventDefault()
    setDetailsWidth(nextWidth)
    saveDetailsWidth()
  }

  if (!values) {
    return null
  }

  return (
    <SearchProvider>
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
                    void updateSettings(
                      'window.navbarWidth',
                      Math.round(inPixels),
                    )
                  }, 250)
                }}
              >
                <Navbar className={styles.navbar} />
              </Panel>
              <Separator className={styles.navigationSeparator} />
              <Panel className={`${styles.pane} ${styles.content}`}>
                <Titlebar className={styles.titlebar} />
                <div
                  className={styles.workspace}
                  style={
                    {
                      '--details-width': `${detailsWidth}px`,
                    } as DetailsWidthStyle
                  }
                >
                  <main className={styles.page}>
                    <Outlet />
                    <div
                      ref={setPageFooterHost}
                      className={styles.pageFooter}
                    />
                  </main>
                  <hr
                    className={styles.detailsSeparator}
                    aria-label="Resize details panel"
                    aria-orientation="vertical"
                    aria-valuemin={minimumDetailsWidth}
                    aria-valuemax={maximumDetailsWidth}
                    aria-valuenow={detailsWidth}
                    tabIndex={detailsVisible ? 0 : -1}
                    hidden={!detailsVisible}
                    data-resizing={resizingDetails}
                    onPointerDown={handleDetailsPointerDown}
                    onPointerMove={handleDetailsPointerMove}
                    onPointerUp={finishDetailsResize}
                    onPointerCancel={finishDetailsResize}
                    onKeyDown={handleDetailsKeyDown}
                  />
                  <div ref={setDetailsHost} className={styles.details}>
                    <aside
                      className={styles.detailsPlaceholder}
                      aria-label="Details"
                    >
                      <header className={styles.detailsPlaceholderHeader}>
                        <h3 className={styles.detailsPlaceholderTitle}>
                          Details
                        </h3>
                      </header>
                      <p className={styles.detailsPlaceholderBody}>
                        Select a file to view its details.
                      </p>
                    </aside>
                  </div>
                </div>
              </Panel>
            </Group>
          </div>
        </PageFooterHostContext>
      </DetailsPaneContext>
    </SearchProvider>
  )
}
