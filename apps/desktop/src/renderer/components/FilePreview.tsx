import { css } from 'inline-css-modules'

const styles = css`
  .preview {
    max-width: 100%;
    flex-shrink: 0;
    aspect-ratio: 1;
    object-fit: contain;
    border-radius: var(--suzy-radius-2);
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
}: {
  entry: Entry
  size?: number | '100%'
  variant?: 'list' | 'grid'
  color?: string
}) {
  const params = new URLSearchParams({
    libraryId: String(entry.libraryId),
    path: entry.relativePath,
    v: String(entry.modifiedAt),
    variant,
    ...(color ? { color } : {}),
  })
  const source = `files-preview://preview-image?${params}`

  return (
    <img
      key={source}
      className={styles.preview}
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ width: size, height: typeof size === 'number' ? size : 'auto' }}
      onError={(event) => {
        // Ask Electron for an icon if Chromium cannot decode the source image.
        const image = event.currentTarget
        if (!new URL(image.src).searchParams.has('fallback')) {
          image.src = `${source}&fallback=1`
        }
      }}
    />
  )
}
