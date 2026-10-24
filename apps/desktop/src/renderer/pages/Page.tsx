import { ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { createContext, useContext, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Group, type Layout, Panel, Separator } from 'react-resizable-panels'
import {
  type CardSizeControl,
  PageCardSizeContext,
  PageFooterHostContext,
} from '../components/layout/PageFooterContext.js'
import ScanningMeter from '../components/layout/ScanningMeter.js'
import { formatFileSize } from '../utils/fileColumns.js'
import { maximumCardSize, minimumCardSize } from '../utils/tablePreferences.js'

const styles = css`
  .page {
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
  }
  .pageContent {
    box-sizing: border-box;
    min-height: 100%;
    padding: var(--suzy-space-2);
  }
  .secondaryContent {
    padding-block-start: var(--suzy-space-2);
    --files-sticky-offset: 0px;
  }
  .splitGroup {
    height: 100%;
    min-height: 0;
  }
  .splitPane {
    min-height: 0;
    overflow: hidden;
  }
  .splitSeparator {
    height: 4px;
    border-radius: var(--suzy-radius-full);
    background: var(--suzy-gray-6);
    transition: background-color 120ms ease;

    &[data-separator='hover'],
    &[data-separator='active'] {
      background: var(--suzy-accent-9);
      transition-delay: 250ms;
    }
  }
  .footer {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--suzy-space-2);
    min-height: 24px;
    box-sizing: border-box;
    padding: var(--suzy-space-1) var(--suzy-space-3);
    border-block-start: 1px solid var(--suzy-gray-6);
    color: var(--suzy-gray-11);
    background: var(--suzy-gray-2);
    font-size: 0.75rem;

    &:empty {
      display: none;
    }
  }
  .separator {
    color: var(--suzy-gray-8);
  }
  .cardSizeControl {
    display: flex;
    align-items: center;
    gap: var(--suzy-space-2);
    margin-inline-start: auto;
    white-space: nowrap;
  }
  .cardSizeSlider {
    width: 72px;
  }
  .splitButton {
    position: absolute;
    inset-block-start: -7px;
    inset-inline-start: 50%;
    width: 44px;
    height: 13px;
    padding: 0;
    border: 1px solid var(--suzy-gray-7);
    border-radius: var(--suzy-radius-full);
    color: var(--suzy-gray-10);
    background: var(--suzy-gray-2);
    cursor: pointer;
    transform: translateX(-50%);

    &::after {
      position: absolute;
      inset-block-start: 5px;
      inset-inline: 11px;
      height: 1px;
      border-radius: var(--suzy-radius-full);
      background: currentColor;
      content: '';
    }

    &:hover,
    &:focus-visible,
    &[aria-pressed='true'] {
      border-color: var(--suzy-accent-8);
      color: var(--suzy-accent-10);
    }

    &:focus-visible {
      outline: 2px solid var(--suzy-accent-8);
      outline-offset: 2px;
    }
  }
`

export type FolderStats = {
  fileCount: number
  folderCount: number
  totalSize: number
  scanning: boolean
}

const FolderStatsContext = createContext<
  React.Dispatch<React.SetStateAction<FolderStats | null>> | undefined
>(undefined)

type PageProps = {
  title: string
  children?: React.ReactNode
  split?: {
    content: React.ReactNode
    storageKey: string
  }
}

type PageContentsProps = {
  children?: React.ReactNode
  split: PageProps['split']
}

type SplitViewState = {
  open: boolean
  layout: Layout
}

const splitStoragePrefix = 'files:split-view:v1:'
const defaultSplitLayout = { primary: 50, secondary: 50 }

function readSplitViewState(storageKey: string): SplitViewState {
  const defaults = { open: false, layout: defaultSplitLayout }

  try {
    const stored = localStorage.getItem(splitStoragePrefix + storageKey)

    if (!stored) {
      return defaults
    }

    const value = JSON.parse(stored)
    const primary = value?.layout?.primary
    const secondary = value?.layout?.secondary
    const hasValidLayout =
      typeof primary === 'number' &&
      Number.isFinite(primary) &&
      primary > 0 &&
      typeof secondary === 'number' &&
      Number.isFinite(secondary) &&
      secondary > 0

    return {
      open: value?.open === true,
      layout: hasValidLayout ? { primary, secondary } : defaults.layout,
    }
  } catch {
    return defaults
  }
}

function writeSplitViewState(storageKey: string, state: SplitViewState) {
  try {
    localStorage.setItem(splitStoragePrefix + storageKey, JSON.stringify(state))
  } catch {
    // Keep the view usable when browser storage is unavailable or full.
  }
}

export default function Page({ children, split }: PageProps) {
  return <PageContents split={split}>{children}</PageContents>
}

function PageContents({ children, split }: PageContentsProps) {
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null)
  const [cardSizeControl, setCardSizeControl] =
    useState<CardSizeControl | null>(null)
  const footerHost = useContext(PageFooterHostContext)
  const storageKey = split?.storageKey
  const [splitViewState, setSplitViewState] = useState(() => ({
    storageKey,
    value: storageKey
      ? readSplitViewState(storageKey)
      : { open: false, layout: defaultSplitLayout },
  }))

  if (splitViewState.storageKey !== storageKey) {
    setSplitViewState({
      storageKey,
      value: storageKey
        ? readSplitViewState(storageKey)
        : { open: false, layout: defaultSplitLayout },
    })
  }

  const splitView =
    splitViewState.storageKey === storageKey
      ? splitViewState.value
      : storageKey
        ? readSplitViewState(storageKey)
        : { open: false, layout: defaultSplitLayout }

  function updateSplitView(
    update: (current: SplitViewState) => SplitViewState,
  ) {
    setSplitViewState((current) => {
      const currentValue =
        current.storageKey === storageKey ? current.value : splitView
      const next = update(currentValue)

      if (storageKey) {
        writeSplitViewState(storageKey, next)
      }

      return { storageKey, value: next }
    })
  }

  const primaryContent = (
    <ScrollArea>
      <div className={styles.pageContent}>{children}</div>
    </ScrollArea>
  )

  return (
    <FolderStatsContext value={setFolderStats}>
      <PageCardSizeContext value={setCardSizeControl}>
        <div className={styles.page}>
          {split && splitView.open ? (
            <Group
              className={styles.splitGroup}
              orientation="vertical"
              defaultLayout={splitView.layout}
              onLayoutChanged={(layout, { isUserInteraction }) => {
                if (isUserInteraction) {
                  updateSplitView((current) => ({ ...current, layout }))
                }
              }}
            >
              <Panel id="primary" className={styles.splitPane} minSize={160}>
                {primaryContent}
              </Panel>
              <Separator className={styles.splitSeparator} />
              <Panel id="secondary" className={styles.splitPane} minSize={160}>
                <ScrollArea>
                  <div
                    className={`${styles.pageContent} ${styles.secondaryContent}`}
                  >
                    {split.content}
                  </div>
                </ScrollArea>
              </Panel>
            </Group>
          ) : (
            primaryContent
          )}
        </div>
        {footerHost &&
          createPortal(
            <FolderStatsFooter
              stats={folderStats}
              cardSizeControl={cardSizeControl}
              splitOpen={splitView.open}
              onSplitToggle={
                split
                  ? () =>
                      updateSplitView((current) => ({
                        ...current,
                        open: !current.open,
                      }))
                  : undefined
              }
            />,
            footerHost,
          )}
      </PageCardSizeContext>
    </FolderStatsContext>
  )
}

export function usePageFolderStats(stats: FolderStats | null, enabled = true) {
  const setFolderStats = useContext(FolderStatsContext)
  const fileCount = stats?.fileCount
  const folderCount = stats?.folderCount
  const totalSize = stats?.totalSize
  const scanning = stats?.scanning

  useEffect(() => {
    if (!setFolderStats || !enabled) {
      return
    }

    setFolderStats(
      fileCount !== undefined &&
        folderCount !== undefined &&
        totalSize !== undefined &&
        scanning !== undefined
        ? { fileCount, folderCount, totalSize, scanning }
        : null,
    )

    return () => setFolderStats(null)
  }, [setFolderStats, enabled, fileCount, folderCount, totalSize, scanning])
}

export function usePageCardSizeControl(
  control: CardSizeControl | null,
  enabled = true,
) {
  const setCardSizeControl = useContext(PageCardSizeContext)

  useEffect(() => {
    if (!setCardSizeControl || !enabled) {
      return
    }

    setCardSizeControl(control)

    return () => setCardSizeControl(null)
  }, [control, enabled, setCardSizeControl])
}

function FolderStatsFooter({
  stats,
  cardSizeControl,
  splitOpen,
  onSplitToggle,
}: {
  stats: FolderStats | null
  cardSizeControl: CardSizeControl | null
  splitOpen: boolean
  onSplitToggle?: (() => void) | undefined
}) {
  const cardSizeId = useId()

  return (
    <footer className={styles.footer}>
      {onSplitToggle && (
        <button
          type="button"
          className={styles.splitButton}
          aria-label={splitOpen ? 'Close split view' : 'Open split view'}
          title={splitOpen ? 'Close split view' : 'Open split view'}
          aria-pressed={splitOpen}
          onClick={onSplitToggle}
        />
      )}
      {stats && (
        <>
          <span>
            {stats.fileCount.toLocaleString()}{' '}
            {stats.fileCount === 1 ? 'file' : 'files'}
          </span>
          <span className={styles.separator} aria-hidden="true">
            ·
          </span>
          <span>
            {stats.folderCount.toLocaleString()}{' '}
            {stats.folderCount === 1 ? 'folder' : 'folders'}
          </span>
          <span className={styles.separator} aria-hidden="true">
            ·
          </span>
          <span>{formatFileSize(stats.totalSize)}</span>
        </>
      )}
      <ScanningMeter />
      {cardSizeControl && (
        <label className={styles.cardSizeControl} htmlFor={cardSizeId}>
          <span>Card size</span>
          <input
            id={cardSizeId}
            className={styles.cardSizeSlider}
            type="range"
            min={minimumCardSize}
            max={maximumCardSize}
            step="4"
            value={cardSizeControl.size}
            aria-valuetext={`${cardSizeControl.size} pixels`}
            onChange={(event) =>
              cardSizeControl.onChange(Number(event.currentTarget.value))
            }
          />
        </label>
      )}
    </footer>
  )
}
