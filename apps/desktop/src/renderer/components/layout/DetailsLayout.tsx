import { css } from 'inline-css-modules'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { useSettings } from '../../hooks/useSettings.js'
import { DetailsPaneContext } from './DetailsPaneContext.js'
import { PageFooterHostContext } from './PageFooterContext.js'
import useResizeHandler from './useResizeHandler.js'

const styles = css`
  .workspace {
    grid-column: 1;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--suzy-gray-2);
  }

  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    view-transition-name: page-content;
  }

  .pageFooter {
    :empty {
      display: none;
    }
  }

  .separator {
    max-width: 100%;
    border-radius: var(--suzy-radius-full);
    background-color: var(--suzy-gray-4);
    transition: background-color 120ms ease;

    &[data-separator='hover'],
    &[data-separator='active'] {
      background-color: var(--suzy-accent-9);
      transition-delay: 250ms;
    }

    &[hidden] {
      display: none;
    }
  }

  .details {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    /* border-top-left-radius: var(--suzy-radius-3); */
    view-transition-name: file-details;

    &[data-closed] {
      view-transition-name: none;
    }

    &:has(> [data-details-pane]) {
      .placeholder {
        display: none;
      }
    }
  }

  .placeholder {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    color: var(--suzy-gray-12);
    background: var(--suzy-gray-4);
  }

  .placeholderHeader {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    min-height: 28px;
    padding: var(--suzy-space-3);
  }

  .placeholderTitle {
    margin: 0;
    font-size: var(--suzy-font-size-3);
    font-weight: 500;
  }

  .placeholderBody {
    margin: 0;
    padding: 0 var(--suzy-space-3) var(--suzy-space-3);
    color: var(--suzy-gray-11);
  }

  :root:active-view-transition-type(details-toggle) {
    view-transition-name: none;

    .separator {
      visibility: hidden;
    }

    &::view-transition {
      pointer-events: none;
    }

    &::view-transition-group(page-content) {
      animation: none;
    }

    &::view-transition-old(page-content) {
      /* Keep the old snapshot at its captured width while it fades. */
      inline-size: auto;
      z-index: 1;
      mix-blend-mode: normal;
      background: var(--suzy-gray-2);
      animation: details-page-fade 100ms ease-out both;
    }

    &::view-transition-new(page-content) {
      animation: none;
      mix-blend-mode: normal;
    }

    &::view-transition-group(file-details) {
      z-index: 2;
    }

    &::view-transition-old(file-details),
    &::view-transition-new(file-details) {
      box-shadow: -4px 0 var(--suzy-gray-4);
    }

    &::view-transition-old(file-details) {
      animation: details-slide 180ms cubic-bezier(0.2, 0, 0, 1) reverse both;
    }

    &::view-transition-new(file-details) {
      animation: details-slide 180ms cubic-bezier(0.2, 0, 0, 1) both;
    }
  }

  @keyframes details-page-fade {
    to { opacity: 0; }
  }

  @keyframes details-slide {
    from { translate: calc(100% + 4px); }
    to { translate: 0; }
  }
`

const minimumDetailsWidth = 280
const maximumDetailsWidth = 600
const separatorWidth = 4

function afterLayout() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
}

type DetailsLayoutProps = {
  children: ReactNode
}

export default function DetailsLayout({ children }: DetailsLayoutProps) {
  const { values, updateSettings } = useSettings(['window.detailsWidth'])
  const detailsPanelRef = usePanelRef()
  const detailsPanelElement = useRef<HTMLDivElement>(null)
  const openDetailsWidth = useRef(minimumDetailsWidth)
  const detailsTransition = useRef<ViewTransition>(null)
  const visibilityRequest = useRef(0)
  const visibleRef = useRef(true)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(true)
  const [pageFooterHost, setPageFooterHost] = useState<HTMLDivElement | null>(
    null,
  )
  const handleResize = useResizeHandler(
    (inPixels) =>
      void updateSettings('window.detailsWidth', Math.round(inPixels)),
  )

  const setVisibility = useCallback(
    async (nextVisible: boolean) => {
      if (nextVisible === visibleRef.current) {
        return
      }

      const request = ++visibilityRequest.current
      const panel = detailsPanelElement.current
      const openWidth = panel?.getBoundingClientRect().width ?? 0

      if (!nextVisible && openWidth > 0) {
        openDetailsWidth.current = openWidth
      }

      detailsTransition.current?.skipTransition()
      visibleRef.current = nextVisible

      if (nextVisible) {
        // Let the panel group measure any window resize before taking snapshots.
        await afterLayout()

        if (request !== visibilityRequest.current) {
          return
        }
      }

      function updateLayout() {
        if (request !== visibilityRequest.current) {
          return
        }

        flushSync(() => {
          setVisible(nextVisible)

          if (!nextVisible) {
            detailsPanelRef.current?.collapse()
          }
        })

        if (nextVisible) {
          flushSync(() =>
            detailsPanelRef.current?.resize(openDetailsWidth.current),
          )
        }
      }

      if (
        !panel ||
        !document.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        // Visibility can also change during a React layout effect.
        await Promise.resolve()
        updateLayout()
        return
      }

      const transition = document.startViewTransition({
        types: ['details-toggle'],
        update: updateLayout,
      })

      detailsTransition.current = transition
      // A newer toggle or navigation can skip the snapshots.
      void transition.ready.catch(() => {})

      try {
        await transition.finished
      } finally {
        if (detailsTransition.current === transition) {
          detailsTransition.current = null
        }
      }
    },
    [detailsPanelRef],
  )

  const detailsPane = useMemo(
    () => ({ host, setVisible: setVisibility }),
    [host, setVisibility],
  )

  useEffect(
    () => () => {
      visibilityRequest.current++
      detailsTransition.current?.skipTransition()
    },
    [],
  )

  if (!values) {
    return null
  }

  return (
    <DetailsPaneContext value={detailsPane}>
      <PageFooterHostContext value={pageFooterHost}>
        <Group className={styles.workspace} orientation="horizontal">
          <Panel id="page" style={{ overflow: 'hidden' }}>
            <main className={styles.page}>
              {children}
              <div ref={setPageFooterHost} className={styles.pageFooter} />
            </main>
          </Panel>
          <Separator
            className={styles.separator}
            style={{ width: separatorWidth }}
            disabled={!visible}
            hidden={!visible}
          />
          <Panel
            id="details"
            elementRef={detailsPanelElement}
            panelRef={detailsPanelRef}
            defaultSize={values['window.detailsWidth']}
            minSize={minimumDetailsWidth}
            maxSize={maximumDetailsWidth}
            collapsible
            collapsedSize={0}
            groupResizeBehavior="preserve-pixel-size"
            style={{ overflow: 'hidden' }}
            onResize={({ inPixels }, _id, previousSize) => {
              if (!visibleRef.current || inPixels < minimumDetailsWidth) {
                return
              }

              openDetailsWidth.current = inPixels

              if (previousSize) {
                handleResize({ inPixels })
              }
            }}
          >
            <div
              ref={setHost}
              className={styles.details}
              data-closed={!visible || undefined}
            >
              <aside className={styles.placeholder} aria-label="Details">
                <header className={styles.placeholderHeader}>
                  <h3 className={styles.placeholderTitle}>Details</h3>
                </header>
                <p className={styles.placeholderBody}>
                  Select a file to view its details.
                </p>
              </aside>
            </div>
          </Panel>
        </Group>
      </PageFooterHostContext>
    </DetailsPaneContext>
  )
}
