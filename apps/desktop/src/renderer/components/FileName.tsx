import { css } from 'inline-css-modules'

const styles = css`
  .name {
    display: inline-flex;
    max-width: 100%;
    min-width: 0;
    vertical-align: bottom;
    white-space: nowrap;
  }
  .start {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .end {
    display: flex;
    min-width: 0;
    overflow: hidden;
    justify-content: flex-end;
  }
  .suffix { flex-shrink: 0; }
`

/** Keep both ends of a filename visible, with the ellipsis in the middle. */
export default function FileName({ name }: { name: string }) {
  const characters = Array.from(name)
  const midpoint = Math.ceil(characters.length / 2)

  return (
    <span className={styles.name} title={name}>
      <span className={styles.start}>
        {characters.slice(0, midpoint).join('')}
      </span>
      <span className={styles.end}>
        <span className={styles.suffix}>
          {characters.slice(midpoint).join('')}
        </span>
      </span>
    </span>
  )
}
