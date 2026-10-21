import { ScrollArea } from '@files/ui'
import { css } from 'inline-css-modules'
import { createContext, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Group, type Layout, Panel, Separator } from 'react-resizable-panels'
import { PageFooterHostContext } from '../components/PageFooterContext.js'
import { formatFileSize } from '../utils/fileColumns.js'

const styles = css`
  .page {
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
  }
  .pageContent {
    box-sizing: border-box;
    min-height: 100%;
    padding: calc(36px + var(--suzy-space-2)) var(--suzy-space-2)
      var(--suzy-space-2);
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
    height: 2px;
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
  }
  .separator {
    color: var(--suzy-gray-8);
  }
  .scanStatus {
    margin-inline-start: auto;
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
  return (
    <PageContents key={split?.storageKey ?? 'single'} split={split}>
      {children}
    </PageContents>
  )
}

function PageContents({ children, split }: PageContentsProps) {
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null)
  const footerHost = useContext(PageFooterHostContext)
  const [splitView, setSplitView] = useState<SplitViewState>(() =>
    split
      ? readSplitViewState(split.storageKey)
      : { open: false, layout: defaultSplitLayout },
  )

  function updateSplitView(
    update: (current: SplitViewState) => SplitViewState,
  ) {
    setSplitView((current) => {
      const next = update(current)

      if (split) {
        writeSplitViewState(split.storageKey, next)
      }

      return next
    })
  }

  const primaryContent = (
    <ScrollArea>
      <div className={styles.pageContent}>{children}</div>
    </ScrollArea>
  )

  return (
    <FolderStatsContext value={setFolderStats}>
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
      {(folderStats || split) &&
        footerHost &&
        createPortal(
          <FolderStatsFooter
            stats={folderStats}
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

function FolderStatsFooter({
  stats,
  splitOpen,
  onSplitToggle,
}: {
  stats: FolderStats | null
  splitOpen: boolean
  onSplitToggle?: (() => void) | undefined
}) {
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
          {stats.scanning && (
            <span className={styles.scanStatus} role="status">
              Scanning folder… Files may be missing.
            </span>
          )}
        </>
      )}
    </footer>
  )
}
