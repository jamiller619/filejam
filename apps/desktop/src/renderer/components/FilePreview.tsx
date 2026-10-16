import { Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { useState } from 'react'
import { previewMimeType } from '../../preview/formats.js'

const styles = css`
  .preview {
    max-width: 100%;
    flex-shrink: 0;
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    place-items: center;

    .image {
      grid-area: 1 / 1;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: var(--suzy-radius-2);
      box-shadow: 0 2px 8px #0000000d;
    }

    .icon {
      grid-area: 1 / 1;
    }

    [data-kind="directory"] {
      color: #2aa5ff;
    }
  }
`

type Entry = {
  id: number
  name: string
  kind: string
  modifiedAt: Date | string | null
}

export default function FilePreview({
  entry,
  size = 40,
}: {
  entry: Entry
  size?: number | '100%'
}) {
  const source = `files-preview://file/${entry.id}?v=${encodeURIComponent(String(entry.modifiedAt))}`
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const showImage =
    entry.kind === 'file' && previewMimeType(entry.name) && failed !== source

  return (
    <span
      className={styles.preview}
      style={{
        width: size,
        height: typeof size === 'number' ? size : 'auto',
        aspectRatio: '1',
      }}
      aria-hidden="true"
    >
      {(!showImage || loaded !== source) && (
        <Icon
          className={styles.icon}
          data-kind={entry.kind}
          name={entry.kind === 'directory' ? 'folder' : 'documents'}
          size={typeof size === 'number' ? size / 2 : 100}
        />
      )}
      {showImage && (
        <img
          key={source}
          className={styles.image}
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ visibility: loaded === source ? 'visible' : 'hidden' }}
          onLoad={() => setLoaded(source)}
          onError={() => setFailed(source)}
        />
      )}
    </span>
  )
}
