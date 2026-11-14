import { css } from 'inline-css-modules'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
    width: 4px;
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
`

const minimumDetailsWidth = 280
const maximumDetailsWidth = 600

type DetailsLayoutProps = {
  children: ReactNode
}

export default function DetailsLayout({ children }: DetailsLayoutProps) {
  const { values, updateSettings } = useSettings(['window.detailsWidth'])
  const detailsPanelRef = usePanelRef()
  const detailsPanelElement = useRef<HTMLDivElement>(null)
  const visibilityAnimation = useRef<Animation>(null)
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

      visibilityAnimation.current?.cancel()
      visibilityAnimation.current = null

      const panel = detailsPanelElement.current
      const initialWidth = panel?.getBoundingClientRect().width ?? 0

      visibleRef.current = nextVisible

      if (nextVisible) {
        setVisible(true)
        detailsPanelRef.current?.expand()
      } else {
        detailsPanelRef.current?.collapse()
      }

      if (
        !panel ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        setVisible(nextVisible)
        return
      }

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )

      if (request !== visibilityRequest.current) {
        return
      }

      const finalWidth = panel.getBoundingClientRect().width

      if (Math.abs(initialWidth - finalWidth) < 1) {
        setVisible(nextVisible)
        return
      }

      const animation = panel.animate(
        [{ flexBasis: `${initialWidth}px` }, { flexBasis: `${finalWidth}px` }],
        {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        },
      )

      visibilityAnimation.current = animation

      try {
        await animation.finished
      } catch {
        // A newer visibility request replaced this animation.
      }

      if (request === visibilityRequest.current) {
        visibilityAnimation.current = null
        setVisible(nextVisible)
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
      visibilityAnimation.current?.cancel()
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
              if (!previousSize || inPixels < minimumDetailsWidth) {
                return
              }

              handleResize({ inPixels })
            }}
          >
            <div ref={setHost} className={styles.details}>
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
