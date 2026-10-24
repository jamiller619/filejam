import { css } from 'inline-css-modules'
import type { DragEventHandler, ReactNode } from 'react'
import { Link } from 'react-router'
import { useFolderDrop } from '../../hooks/useFolderDrop.js'
import FileName from './FileName.js'

const styles = css`
  @keyframes folder-drag-lift {
    0% { transform: translateY(0) scale(1); }
    55% { transform: translateY(-4px) scale(1.04); }
    100% { transform: translateY(0) scale(1); }
  }

  .card {
    min-width: 0;
    border-radius: var(--suzy-radius-4);
    background: var(--suzy-gray-3);
    &:hover, &:focus-within { background: var(--suzy-gray-4); }
    &[data-selected='true'] {
      background: var(--suzy-accent-9);
      color: var(--suzy-accent-1);

      [data-extension-color] {
        --file-name-color: var(--suzy-accent-1);
      }
    }
    &[data-folder-dragging='true'] {
      opacity: 0.45;
      animation: folder-drag-lift var(--suzy-duration-normal) cubic-bezier(0.2, 1.4, 0.4, 1) both;
      will-change: transform, opacity;
    }
    &[data-folder-drop-active='true'] {
      outline: 2px solid var(--suzy-accent-9);
      outline-offset: 2px;
      background: var(--suzy-gray-4);
    }
    &[data-folder-drop-failed='true'] {
      outline: 2px solid var(--suzy-danger-9);
      outline-offset: 2px;
    }
    &[data-preview-only='true'] {
      background: transparent;

      &:hover, &:focus-within {
        background: transparent;
      }

      &[data-selected='true'] {
        outline: 2px solid var(--suzy-accent-9);
        outline-offset: -2px;
      }

      .cardAction {
        gap: 0;
        padding: 0;
      }
    }
  }
  .cardAction {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--suzy-space-2);
    width: 100%;
    padding: var(--suzy-space-2);
    border: 0;
    border-radius: inherit;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
    &:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    &[draggable='true'] {
      cursor: grab;
      &:active { cursor: grabbing; }
    }
  }
`

type GridCardProps = {
  as?: 'div' | 'li'
  fileId?: number
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLAnchorElement>
  onDragEnd?: DragEventHandler<HTMLAnchorElement>
  folderPath?: string | undefined
  name: string
  isDirectory?: boolean
  highlight?: string | undefined
  title?: string
  children: ReactNode
  selected?: boolean
  previewOnly?: boolean
} & (
  | { to: string }
  | {
      onClick: () => void
      'aria-label'?: string
      'aria-expanded'?: boolean
    }
)

export default function GridCard(props: GridCardProps) {
  const folderDropProps = useFolderDrop(props.folderPath)
  const CardContainer = props.as ?? 'li'
  const content = (
    <>
      {props.children}
      {!props.previewOnly && (
        <FileName
          name={props.name}
          isDirectory={props.isDirectory}
          highlight={props.highlight}
        />
      )}
    </>
  )

  return (
    <CardContainer
      {...folderDropProps}
      className={styles.card}
      data-preview-only={props.previewOnly || undefined}
      data-selected={props.selected ?? false}
      data-file-id={props.fileId}
      data-folder-drag-preview={props.draggable || undefined}
    >
      {'to' in props ? (
        <Link
          className={styles.cardAction}
          title={props.title ?? props.name}
          to={props.to}
          viewTransition
          draggable={props.draggable}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          className={styles.cardAction}
          title={props.title ?? props.name}
          aria-label={props['aria-label']}
          aria-expanded={props['aria-expanded']}
          onClick={props.onClick}
        >
          {content}
        </button>
      )}
    </CardContainer>
  )
}
