import { css } from 'inline-css-modules'
import {
  colorForFileName,
  type FileColor,
  fileColorForName,
} from '../utils/fileColors.js'

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
`

/** Keep both ends of a filename visible, with the ellipsis in the middle. */
export default function FileName({
  name,
  isDirectory = false,
}: {
  name: string
  isDirectory?: boolean | undefined
}) {
  const characters = Array.from(name)
  const midpoint = Math.ceil(characters.length / 2)

  return (
    <span
      className={styles.name}
      title={name}
      data-extension-color={isDirectory ? undefined : colorForFileName(name)}
    >
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
