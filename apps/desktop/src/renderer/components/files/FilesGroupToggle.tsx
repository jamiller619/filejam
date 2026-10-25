import { Icon } from '@filejam/ui'
import { css } from 'inline-css-modules'

const styles = css`
  .toggle {
    display: flex;
    width: 100%;
    align-items: center;
    gap: var(--suzy-space-2);
    padding: var(--suzy-space-2);
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;

    &:hover { color: var(--suzy-gray-12); }
    &:focus-visible { outline: 2px solid var(--suzy-accent-8); }
  }
  .chevron {
    flex: 0 0 auto;
    transition: transform 120ms ease;

    [aria-expanded='true'] & { transform: rotate(90deg); }
  }
`

export default function FilesGroupToggle({
  expanded,
  label,
  onClick,
}: {
  expanded: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <Icon className={styles.chevron} name="chevron-right" size={12} />
      {label}
    </button>
  )
}
