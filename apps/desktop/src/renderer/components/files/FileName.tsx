import { css } from 'inline-css-modules'
import {
  colorForFileName,
  type FileColor,
  fileColorForName,
} from '../../utils/fileColors.js'
import { fileNameForDisplay } from '../../utils/fileNames.js'

export { type FileColor, fileColorForName }

const styles = css`
  .name {
    display: inline-flex;
    max-width: 100%;
    min-width: 0;
    color: var(--file-name-color, inherit);
    vertical-align: bottom;
    white-space: nowrap;
  }
  .name[data-extension-color='blue'] { --file-name-color: light-dark(#006adc, #70b8ff); }
  .name[data-extension-color='cyan'] { --file-name-color: light-dark(#00749e, #4ccce6); }
  .name[data-extension-color='green'] { --file-name-color: light-dark(#18794e, #4cc38a); }
  .name[data-extension-color='orange'] { --file-name-color: light-dark(#cc4e00, #ffa057); }
  .name[data-extension-color='pink'] { --file-name-color: light-dark(#cd1d8d, #f65cb6); }
  .name[data-extension-color='purple'] { --file-name-color: light-dark(#8145b5, #be93e4); }
  .name[data-extension-color='red'] { --file-name-color: light-dark(#ce2c31, #ff6369); }
  .name[data-extension-color='yellow'] { --file-name-color: light-dark(#946800, #f5d90a); }
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
  .match {
    border-radius: 2px;
    color: #171700;
    background: #fff200;
    box-shadow: 0 0 0 1px #e6d900;
  }
`

/** Keep both ends of a filename visible, with the ellipsis in the middle. */
export default function FileName({
  name,
  isDirectory = false,
  showExtension = false,
  highlight,
}: {
  name: string
  isDirectory?: boolean | undefined
  showExtension?: boolean | undefined
  highlight?: string | undefined
}) {
  const displayName = fileNameForDisplay(
    name,
    isDirectory ? true : showExtension,
  )
  const characters = Array.from(displayName)
  const midpoint = Math.ceil(characters.length / 2)
  const start = characters.slice(0, midpoint).join('')
  const end = characters.slice(midpoint).join('')
  const matches = findMatches(displayName, highlight)

  return (
    <span
      className={styles.name}
      title={name}
      data-extension-color={isDirectory ? undefined : colorForFileName(name)}
    >
      <span className={styles.start}>
        {highlightMatches(start, 0, matches)}
      </span>
      <span className={styles.end}>
        <span className={styles.suffix}>
          {highlightMatches(end, start.length, matches)}
        </span>
      </span>
    </span>
  )
}

type Match = { start: number; end: number }

function findMatches(name: string, search?: string): Match[] {
  const query = search?.trim().toLowerCase()

  if (!query) {
    return []
  }

  const normalizedName = name.toLowerCase()
  const matches: Match[] = []
  let start = normalizedName.indexOf(query)

  while (start !== -1) {
    const end = start + query.length

    matches.push({ start, end })
    start = normalizedName.indexOf(query, end)
  }

  return matches
}

function highlightMatches(text: string, offset: number, matches: Match[]) {
  if (!matches.length) {
    return text
  }

  const end = offset + text.length
  const parts: React.ReactNode[] = []
  let cursor = offset

  for (const match of matches) {
    const matchStart = Math.max(match.start, offset)
    const matchEnd = Math.min(match.end, end)

    if (matchStart >= matchEnd) {
      continue
    }

    if (cursor < matchStart) {
      parts.push(text.slice(cursor - offset, matchStart - offset))
    }

    parts.push(
      <mark className={styles.match} key={`${matchStart}-${matchEnd}`}>
        {text.slice(matchStart - offset, matchEnd - offset)}
      </mark>,
    )
    cursor = matchEnd
  }

  if (cursor < end) {
    parts.push(text.slice(cursor - offset))
  }

  return parts.length ? parts : text
}
