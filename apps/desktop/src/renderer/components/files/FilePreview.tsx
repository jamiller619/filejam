import { Button, Icon } from '@filejam/ui'
import { clsx } from 'clsx'
import { css } from 'inline-css-modules'
import { useEffect, useRef, useState } from 'react'
import type { FileColor } from './FileName.js'

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

  .natural {
    width: 100%;
    height: auto;
    aspect-ratio: auto;

    .preview {
      width: 100%;
    }
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
    border-radius: var(--suzy-radius-1);
    corner-shape: var(--suzy-corner-shape);
  }

  .preview[src*='fallback=1'] {
    width: auto;
    max-width: min(100%, 48px);
    max-height: min(100%, 48px);
  }
`

type Entry = {
  libraryId: number
  relativePath: string
  modifiedAt: Date | string | null
}

const visibilityListeners = new Map<Element, (visible: boolean) => void>()

const previewObserver =
  typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibilityListeners.get(entry.target)?.(entry.isIntersecting)
          }
        },
        { rootMargin: '200px 0px' },
      )

function observeVisibility(
  element: Element,
  listener: (visible: boolean) => void,
) {
  if (!previewObserver) {
    listener(true)

    return () => undefined
  }

  visibilityListeners.set(element, listener)
  previewObserver.observe(element)

  return () => {
    previewObserver.unobserve(element)
    visibilityListeners.delete(element)
  }
}

export default function FilePreview({
  entry,
  size = 40,
  variant = 'list',
  color,
  onOpen,
  naturalSize = false,
}: {
  entry: Entry
  size?: number | '100%'
  variant?: 'list' | 'grid'
  color?: FileColor | undefined
  onOpen?: () => void
  naturalSize?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(Boolean(onOpen))
  const [loadedSource, setLoadedSource] = useState('')
  const [settledSource, setSettledSource] = useState('')
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

    void window.filejam
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
    ...(color ? { color: color.light, darkColor: color.dark } : {}),
  })

  const source = `filejam-preview://preview-image?${params}`
  const shouldLoad = detail || nearViewport || settledSource === source

  useEffect(() => {
    const container = containerRef.current

    if (detail || !container) {
      return
    }

    return observeVisibility(container, setNearViewport)
  }, [detail])

  return (
    <div
      ref={containerRef}
      className={clsx(
        styles.container,
        imageCandidate && styles.expandable,
        naturalSize && styles.natural,
      )}
      style={{
        width: imageCandidate || naturalSize ? undefined : size,
        height: naturalSize || typeof size !== 'number' ? 'auto' : size,
      }}
    >
      {shouldLoad && (
        <img
          key={source}
          className={styles.preview}
          src={source}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority={detail ? 'high' : 'low'}
          onLoad={(event) => {
            setSettledSource(source)

            if (
              !new URL(event.currentTarget.src).searchParams.has('fallback')
            ) {
              setLoadedSource(source)
            }
          }}
          onError={(event) => {
            setLoadedSource('')

            // Retry through the native file icon path when a preview cannot decode.
            const image = event.currentTarget

            if (!new URL(image.src).searchParams.has('fallback')) {
              const fallback = new URL(source)

              fallback.searchParams.delete('original')
              fallback.searchParams.set('fallback', '1')
              image.src = fallback.href
            }
          }}
        />
      )}
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
