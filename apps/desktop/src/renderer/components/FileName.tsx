import { css } from 'inline-css-modules'

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

const extensionColors = {
  blue: new Set(['doc', 'docx', 'md', 'odt', 'pdf', 'rtf', 'tex', 'txt']),
  cyan: new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']),
  green: new Set(['csv', 'ods', 'tsv', 'xls', 'xlsx']),
  orange: new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip']),
  pink: new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav', 'wma']),
  purple: new Set([
    'avif',
    'bmp',
    'gif',
    'heic',
    'ico',
    'jpeg',
    'jpg',
    'png',
    'raw',
    'svg',
    'tif',
    'tiff',
    'webp',
  ]),
  red: new Set([
    'bash',
    'c',
    'cpp',
    'cs',
    'css',
    'go',
    'h',
    'html',
    'java',
    'js',
    'json',
    'jsx',
    'kt',
    'php',
    'ps1',
    'py',
    'rb',
    'rs',
    'scss',
    'sh',
    'sql',
    'swift',
    'ts',
    'tsx',
    'xml',
    'yaml',
    'yml',
    'zsh',
  ]),
  yellow: new Set(['odp', 'ppt', 'pptx']),
} as const

type ExtensionColor = keyof typeof extensionColors

export type FileColor = { light: string; dark: string }

const colorPalette: Record<ExtensionColor, FileColor> = {
  blue: { light: '#006adc', dark: '#70b8ff' },
  cyan: { light: '#00749e', dark: '#4ccce6' },
  green: { light: '#18794e', dark: '#4cc38a' },
  orange: { light: '#cc4e00', dark: '#ffa057' },
  pink: { light: '#cd1d8d', dark: '#f65cb6' },
  purple: { light: '#8145b5', dark: '#be93e4' },
  red: { light: '#ce2c31', dark: '#ff6369' },
  yellow: { light: '#946800', dark: '#f5d90a' },
}

const defaultFileColor: FileColor = { light: '#211f26', dark: '#eeeef0' }

const fallbackColors = Object.keys(extensionColors) as ExtensionColor[]

function colorForExtension(name: string): ExtensionColor | undefined {
  const separator = name.lastIndexOf('.')

  if (separator <= 0 || separator === name.length - 1) {
    return undefined
  }

  const extension = name.slice(separator + 1).toLowerCase()

  for (const color of fallbackColors) {
    if (extensionColors[color].has(extension)) {
      return color
    }
  }

  const hash = Array.from(extension).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  )

  return fallbackColors[hash % fallbackColors.length]
}

export function fileColorForName(name: string): FileColor {
  const color = colorForExtension(name)

  return color ? colorPalette[color] : defaultFileColor
}

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
      data-extension-color={isDirectory ? undefined : colorForExtension(name)}
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
