import { Button, Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { useEffect, useState } from 'react'

const styles = css`
  .container {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    flex-shrink: 0;
    aspect-ratio: 1;
  }

  .expandable {
    position: relative;
    aspect-ratio: auto;
    width: fit-content;
  }

  .open {
    position: absolute;
    bottom: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    padding: 4px;
    box-shadow: 0 1px 5px #0006;
    &:focus-visible { outline: 2px solid var(--suzy-text); outline-offset: 2px; }
  }

  .preview {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: var(--suzy-radius-4);
    corner-shape: var(--suzy-corner-shape);
  }
`

type Entry = {
  libraryId: number
  relativePath: string
  modifiedAt: Date | string | null
}

export default function FilePreview({
  entry,
  size = 40,
  variant = 'list',
  color,
  onOpen,
}: {
  entry: Entry
  size?: number | '100%'
  variant?: 'list' | 'grid'
  color?: string
  onOpen?: () => void
}) {
  const [loadedSource, setLoadedSource] = useState('')
  const [originalSource, setOriginalSource] = useState('')
  const identity = `${entry.libraryId}:${entry.relativePath}:${entry.modifiedAt}`
  const imageCandidate = Boolean(onOpen && originalSource === identity)
  const detail = Boolean(onOpen)

  const pixels = Math.min(
    2048,
    Math.max(
      1,
      Math.ceil(
        (typeof size === 'number' ? size : 1024) * window.devicePixelRatio,
      ),
    ),
  )

  useEffect(() => {
    if (!detail) {
      return
    }

    const controller = new AbortController()

    void window.files
      .previewCapabilities(entry.libraryId, entry.relativePath)
      .then((result) => {
        if (!controller.signal.aborted) {
          setOriginalSource(result?.original ? identity : '')
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [detail, entry.libraryId, entry.relativePath, identity])

  const params = new URLSearchParams({
    libraryId: String(entry.libraryId),
    path: entry.relativePath,
    v: String(entry.modifiedAt),
    variant,
    width: String(pixels),
    height: String(pixels),
    purpose: detail ? 'detail' : 'thumbnail',
    ...(imageCandidate ? { original: '1' } : {}),
    ...(color ? { color } : {}),
  })

  const source = `files-preview://preview-image?${params}`

  return (
    <div
      className={`${styles.container} ${imageCandidate ? styles.expandable : ''}`}
      style={{
        width: imageCandidate ? undefined : size,
        height: typeof size === 'number' ? size : 'auto',
      }}
    >
      <img
        key={source}
        className={styles.preview}
        src={source}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          if (!new URL(event.currentTarget.src).searchParams.has('fallback')) {
            setLoadedSource(source)
          }
        }}
        onError={(event) => {
          setLoadedSource('')

          // Ask Electron for an icon if Chromium cannot decode the source image.
          const image = event.currentTarget

          if (!new URL(image.src).searchParams.has('fallback')) {
            const fallback = new URL(source)

            fallback.searchParams.delete('original')
            fallback.searchParams.set('fallback', '1')
            image.src = fallback.href
          }
        }}
      />
      {imageCandidate && loadedSource === source && (
        <Button
          className={styles.open}
          onClick={onOpen}
          title="Open full-size image"
          aria-label="Open full-size image"
        >
          <Icon name="magnifying-glass" size={16} />
        </Button>
      )}
    </div>
  )
}
