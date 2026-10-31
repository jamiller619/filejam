import type { ScannerStatus } from '@filejam/server/scanner'
import { css } from 'inline-css-modules'
import { useEffect, useRef, useState } from 'react'

const styles = css`
  .meter {
    display: flex;
    align-items: center;
    gap: var(--suzy-space-2);
    margin-inline-start: auto;
    opacity: 0;
    transform: translateY(2px);
    transition:
      opacity 200ms ease,
      transform 200ms ease;
    white-space: nowrap;

    &[data-visible='true'] {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .progress {
    display: block;
    flex-shrink: 0;
    width: 72px;
    height: 4px;

    &:indeterminate,
    &:indeterminate::-webkit-progress-bar {
      background:
        linear-gradient(
          90deg,
          transparent 25%,
          var(--suzy-action) 45%,
          var(--suzy-action) 55%,
          transparent 75%
        ),
        var(--suzy-border-strong);
      background-size: 200% 100%;
      animation: scan-progress 1.2s linear infinite;
    }
  }

  .percentage {
    min-width: 3ch;
    color: var(--suzy-gray-10);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  @media (prefers-reduced-motion: reduce) {
    .meter {
      transform: none;
      transition-duration: 0ms;
    }

    .progress:indeterminate,
    .progress:indeterminate::-webkit-progress-bar {
      background-position: center;
      animation: none;
    }
  }

  @keyframes scan-progress {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
`

const fadeDuration = 200
const completionDuration = 750

export default function ScanningMeter() {
  const [status, setStatus] = useState<ScannerStatus | null>(null)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const requestNumber = useRef(0)

  useEffect(() => {
    let mounted = true
    let completionTimer: ReturnType<typeof setTimeout> | undefined
    let pendingStatus: ScannerStatus | undefined

    const display = (nextStatus: ScannerStatus) => {
      clearTimeout(hideTimer.current)

      if (nextStatus.state === 'scanning') {
        setStatus(nextStatus)
        setVisible(true)
        return
      }

      setVisible(false)
      hideTimer.current = setTimeout(() => {
        if (mounted) {
          setStatus(null)
        }
      }, fadeDuration)
    }

    const update = (nextStatus: ScannerStatus) => {
      if (!mounted) {
        return
      }

      requestNumber.current++

      if (completionTimer !== undefined) {
        pendingStatus = nextStatus
        return
      }

      display(nextStatus)

      const activeRoot =
        nextStatus.active.length === 1
          ? nextStatus.roots.find(
              (root) => root.root === nextStatus.active[0],
            )
          : undefined
      const finishedRoot =
        activeRoot?.state === 'completed' || activeRoot?.state === 'failed'

      if (finishedRoot) {
        // Keep the actual final counters visible when the next drive starts
        // immediately, without delaying scanner work or inventing progress.
        completionTimer = setTimeout(() => {
          completionTimer = undefined

          if (mounted && pendingStatus) {
            const latest = pendingStatus

            pendingStatus = undefined
            update(latest)
          }
        }, completionDuration)
      }
    }

    const request = ++requestNumber.current

    void window.scanner
      .status()
      .then((status) => {
        if (request === requestNumber.current) {
          update(status)
        }
      })
      .catch(() => {
        // The footer should stay out of the way if the scanner is unavailable.
      })

    const unsubscribe = window.scanner.onUpdated(update)

    return () => {
      mounted = false
      requestNumber.current++
      clearTimeout(hideTimer.current)
      clearTimeout(completionTimer)
      unsubscribe()
    }
  }, [])

  if (!status) {
    return null
  }

  const activeStatus =
    status.active.length === 1
      ? status.roots.find((root) => root.root === status.active[0])
      : undefined
  const progress = activeStatus ?? status
  const determinate =
    status.active.length === 1 &&
    progress.total > 0 &&
    (progress.totalKnown ||
      progress.phase === 'checking' ||
      progress.state === 'completed')
  const percentage = determinate
    ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
    : null
  const rootCount = status.active.length + status.queued.length
  const drive = activeStatus?.root?.match(/^([a-z]:)[\\/]/i)?.[1]
  const label = drive
    ? `${progress.state === 'failed' ? 'Scan failed on' : progress.state === 'completed' ? 'Scanned' : 'Scanning'} ${drive.toUpperCase()}`
    : rootCount === 1
      ? 'Scanning folder'
      : 'Scanning folders'

  return (
    <div className={styles.meter} data-visible={visible} role="status">
      <span>{label}</span>
      <progress
        className={styles.progress}
        max={determinate ? progress.total : undefined}
        value={determinate ? progress.processed : undefined}
        aria-label="Scan progress"
      />
      {percentage !== null && (
        <span className={styles.percentage} aria-hidden="true">
          {percentage}%
        </span>
      )}
    </div>
  )
}
