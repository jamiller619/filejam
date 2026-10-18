import { css } from 'inline-css-modules'

const styles = css`
  .container {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    flex-shrink: 0;
    aspect-ratio: 1;
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
    <div
      className={styles.container}
      style={{ width: size, height: typeof size === 'number' ? size : 'auto' }}
    >
      <img
        key={source}
        className={styles.preview}
        src={source}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          // Ask Electron for an icon if Chromium cannot decode the source image.
          const image = event.currentTarget
          if (!new URL(image.src).searchParams.has('fallback')) {
            image.src = `${source}&fallback=1`
          }
        }}
      />
    </div>
  )
}
