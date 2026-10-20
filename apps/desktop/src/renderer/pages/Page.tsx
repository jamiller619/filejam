import { css } from 'inline-css-modules'
import { createContext, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { PageFooterHostContext } from '../components/PageFooterContext.js'
import { formatFileSize } from '../utils/fileColumns.js'

const styles = css`
  .page {
    box-sizing: border-box;
    min-height: 100%;
    padding: var(--suzy-space-2);
  }
  .footer {
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
}

export default function Page({ children }: PageProps) {
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null)
  const footerHost = useContext(PageFooterHostContext)

  return (
    <FolderStatsContext value={setFolderStats}>
      <div className={styles.page}>{children}</div>
      {folderStats &&
        footerHost &&
        createPortal(<FolderStatsFooter stats={folderStats} />, footerHost)}
    </FolderStatsContext>
  )
}

export function usePageFolderStats(stats: FolderStats | null) {
  const setFolderStats = useContext(FolderStatsContext)
  const fileCount = stats?.fileCount
  const folderCount = stats?.folderCount
  const totalSize = stats?.totalSize
  const scanning = stats?.scanning

  useEffect(() => {
    if (!setFolderStats) {
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
  }, [setFolderStats, fileCount, folderCount, totalSize, scanning])
}

function FolderStatsFooter({ stats }: { stats: FolderStats }) {
  const { fileCount, folderCount, totalSize, scanning } = stats

  return (
    <footer className={styles.footer}>
      <span>
        {fileCount.toLocaleString()} {fileCount === 1 ? 'file' : 'files'}
      </span>
      <span className={styles.separator} aria-hidden="true">
        ·
      </span>
      <span>
        {folderCount.toLocaleString()}{' '}
        {folderCount === 1 ? 'folder' : 'folders'}
      </span>
      <span className={styles.separator} aria-hidden="true">
        ·
      </span>
      <span>{formatFileSize(totalSize)}</span>
      {scanning && (
        <span className={styles.scanStatus} role="status">
          Scanning folder… Files may be missing.
        </span>
      )}
    </footer>
  )
}
