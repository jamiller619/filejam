import type { IconTarget } from '@filejam/server/icons'
import { css } from 'inline-css-modules'
import type { DragEventHandler, MouseEventHandler, ReactNode } from 'react'
import { Link } from 'react-router'
import { useFolderDrop } from '../../hooks/useFolderDrop.js'
import ItemIcon from '../icons/ItemIcon.js'
import FileName from './FileName.js'
import FolderLink from './FolderLink.js'
import { fileSelectionStyles } from './fileSelectionStyles.js'

const styles = css`
  @keyframes folder-drag-lift {
    0% { transform: translateY(0) scale(1); }
    55% { transform: translateY(-4px) scale(1.04); }
    100% { transform: translateY(0) scale(1); }
  }

  .card {
    min-width: 0;
    border-radius: var(--suzy-radius-3);
    corner-shape: var(--suzy-corner-shape);
    background: var(--file-selection-background, oklch(from var(--suzy-gray-12) l c h / 10%));

    &:hover, &:focus-within {
      background: var(--file-selection-background, oklch(from var(--suzy-gray-12) l c h / 12%));
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
      background: var(--file-selection-background, transparent);

      &:hover, &:focus-within {
        background: var(--file-selection-background, transparent);
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
  }
`

type GridCardProps = {
  iconTarget?: IconTarget
  as?: 'div' | 'li'
  fileId?: number
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLAnchorElement>
  onDragEnd?: DragEventHandler<HTMLAnchorElement>
  folderPath?: string | undefined
  name: string
  isDirectory?: boolean
  highlight?: string | undefined
  showExtension?: boolean
  title?: string
  children: ReactNode
  selected?: boolean
  previewOnly?: boolean
} & (
  | { to: string }
  | {
      onClick: () => void
      onDoubleClick?: MouseEventHandler<HTMLButtonElement> | undefined
      'aria-label'?: string
      'aria-expanded'?: boolean
    }
)

export default function GridCard(props: GridCardProps) {
  const folderDropProps = useFolderDrop(props.folderPath)
  const CardContainer = props.as ?? 'li'
  const CardLink = props.fileId === undefined ? Link : FolderLink
  const content = (
    <>
      {props.children}
      {!props.previewOnly && (
        <span
          style={{
            display: 'inline-flex',
            gap: 6,
            alignItems: 'center',
            maxWidth: '100%',
          }}
        >
          {props.iconTarget && (
            <ItemIcon target={props.iconTarget} size={16} fallback={null} />
          )}
          <FileName
            name={props.name}
            isDirectory={props.isDirectory}
            highlight={props.highlight}
            showExtension={props.showExtension}
          />
        </span>
      )}
    </>
  )

  return (
    <CardContainer
      {...folderDropProps}
      className={`${styles.card} ${fileSelectionStyles.selectable}`}
      data-preview-only={props.previewOnly || undefined}
      data-selected={props.selected ?? false}
      data-file-id={props.fileId}
      data-folder-drag-preview={props.draggable || undefined}
    >
      {'to' in props ? (
        <CardLink
          className={styles.cardAction}
          title={props.title ?? props.name}
          to={props.to}
          viewTransition
          draggable={props.draggable}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
        >
          {content}
        </CardLink>
      ) : (
        <button
          type="button"
          className={styles.cardAction}
          title={props.title ?? props.name}
          aria-label={props['aria-label']}
          aria-expanded={props['aria-expanded']}
          onClick={props.onClick}
          onDoubleClick={props.onDoubleClick}
        >
          {content}
        </button>
      )}
    </CardContainer>
  )
}
