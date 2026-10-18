import { css } from 'inline-css-modules'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const styles = css`
  .card {
    min-width: 0;
    border-radius: var(--suzy-radius-4);
    background: var(--suzy-gray-3);
    &:hover, &:focus-within { background: var(--suzy-gray-4); }
    &[data-selected='true'] { background: var(--suzy-accent-9); color: var(--suzy-accent-1); }
  }
  .cardAction {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--suzy-space-2);
    width: 100%;
    padding: var(--suzy-space-3);
    border: 0;
    border-radius: inherit;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: none;
    cursor: pointer;
    &:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
  }
  .cardName {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

type GridCardProps = {
  name: string
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
      <span className={styles.cardName}>{props.name}</span>
    </>
  )

  return (
    <li className={styles.card} data-selected={props.selected ?? false}>
      {'to' in props ? (
        <Link
          className={styles.cardAction}
          title={props.title ?? props.name}
          to={props.to}
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
