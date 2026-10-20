import { css } from 'inline-css-modules'
import type { DragEventHandler, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import FileName from './FileName.js'

const styles = css`
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
  }
`

type GridCardProps = {
  fileId?: number
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLAnchorElement>
  name: string
  isDirectory?: boolean
  title?: string
  children: ReactNode
  selected?: boolean
} & (
  | { to: string }
  | {
      onClick: () => void
      'aria-label'?: string
      'aria-expanded'?: boolean
    }
)

export default function GridCard(props: GridCardProps) {
  const content = (
    <>
      {props.children}
      <FileName name={props.name} isDirectory={props.isDirectory} />
    </>
  )

  return (
    <li
      className={styles.card}
      data-selected={props.selected ?? false}
      data-file-id={props.fileId}
    >
      {'to' in props ? (
        <Link
          className={styles.cardAction}
          title={props.title ?? props.name}
          to={props.to}
          draggable={props.draggable}
          onDragStart={props.onDragStart}
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
    </li>
  )
}
