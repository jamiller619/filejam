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
    width: 72px;
    height: 4px;
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
  }
`

const fadeDuration = 200

export default function ScanningMeter() {
  const [status, setStatus] = useState<ScannerStatus | null>(null)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const requestNumber = useRef(0)

  useEffect(() => {
    let mounted = true

    const update = (nextStatus: ScannerStatus) => {
      if (!mounted) {
        return
      }

      requestNumber.current++
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
      unsubscribe()
    }
  }, [])

  if (!status) {
    return null
  }

  const determinate = status.phase === 'checking' && status.total > 0
  const percentage = determinate
    ? Math.min(100, Math.round((status.processed / status.total) * 100))
    : null
  const rootCount = status.active.length + status.queued.length
  const label = rootCount === 1 ? 'Scanning folder' : 'Scanning folders'

  return (
    <div className={styles.meter} data-visible={visible} role="status">
      <span>{label}</span>
      <progress
        className={styles.progress}
        max={determinate ? status.total : undefined}
        value={determinate ? status.processed : undefined}
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
