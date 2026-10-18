import { Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { type ComponentProps, useState } from 'react'
import { previewMimeType } from '../../preview/formats.js'
import FolderIcon from '../assets/FolderIcon.js'

const styles = css`
  .preview {
    position: relative;
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

    .folder {
      grid-area: 1 / 1;
      width: 100%;
      height: 100%;
    }

    .folderOverlay {
      position: absolute;
      top: 56%;
      left: 50%;
      width: 40%;
      height: 40%;
      transform: translate(-50%, -50%);
      color: var(--suzy-accent-6);
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
  allowPreview = true,
  variant = 'list',
  icon,
}: {
  entry: Entry
  size?: number | '100%'
  allowPreview?: boolean
  variant?: 'list' | 'grid'
  icon?: ComponentProps<typeof Icon>['name']
}) {
  const source = `files-preview://file/${entry.id}?v=${encodeURIComponent(String(entry.modifiedAt))}`
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const showImage =
    allowPreview &&
    entry.kind === 'file' &&
    previewMimeType(entry.name) &&
    failed !== source

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
      {variant === 'grid' && entry.kind === 'directory' ? (
        <>
          <FolderIcon className={styles.folder} />
          {icon && <Icon className={styles.folderOverlay} name={icon} />}
        </>
      ) : (
        (!showImage || loaded !== source) && (
          <Icon
            className={styles.icon}
            data-kind={entry.kind}
            name={icon ?? (entry.kind === 'directory' ? 'folder' : 'documents')}
            size={typeof size === 'number' ? size / 2 : 100}
          />
        )
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
