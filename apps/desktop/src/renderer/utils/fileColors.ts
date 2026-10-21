export const fileColorNames = [
  'blue',
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'yellow',
] as const

export type FileColorName = (typeof fileColorNames)[number]

export type FileColor = { light: string; dark: string }

export const fileColorPalette: Record<FileColorName, FileColor> = {
  blue: { light: '#006adc', dark: '#70b8ff' },
  cyan: { light: '#00749e', dark: '#4ccce6' },
  green: { light: '#18794e', dark: '#4cc38a' },
  orange: { light: '#cc4e00', dark: '#ffa057' },
  pink: { light: '#cd1d8d', dark: '#f65cb6' },
  purple: { light: '#8145b5', dark: '#be93e4' },
  red: { light: '#ce2c31', dark: '#ff6369' },
  yellow: { light: '#946800', dark: '#f5d90a' },
}

const extensionColors: Record<FileColorName, ReadonlySet<string>> = {
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
}

const defaultFileColor: FileColor = { light: '#211f26', dark: '#eeeef0' }

function colorForStableValue(value: string): FileColorName {
  const hash = Array.from(value).reduce(
    (current, character) => (current * 31 + character.charCodeAt(0)) >>> 0,
    0,
  )

  return fileColorNames[hash % fileColorNames.length] ?? 'blue'
}

export function colorForFileName(name: string): FileColorName | undefined {
  const separator = name.lastIndexOf('.')

  if (separator <= 0 || separator === name.length - 1) {
    return undefined
  }

  const extension = name.slice(separator + 1).toLowerCase()

  for (const color of fileColorNames) {
    if (extensionColors[color].has(extension)) {
      return color
    }
  }

  return colorForStableValue(extension)
}

export function fileColorForName(name: string): FileColor {
  const color = colorForFileName(name)

  return color ? fileColorPalette[color] : defaultFileColor
}

function colorForDate(date: Date, referenceDate: Date): FileColorName {
  const age = referenceDate.getTime() - date.getTime()
  const day = 24 * 60 * 60 * 1000

  if (age < day) {
    return 'green'
  }

  if (age < 2 * day) {
    return 'cyan'
  }

  if (age < 7 * day) {
    return 'blue'
  }

  if (age < 14 * day) {
    return 'purple'
  }

  if (age < 30 * day) {
    return 'pink'
  }

  if (age < 90 * day) {
    return 'orange'
  }

  if (age < 365 * day) {
    return 'yellow'
  }

  return 'red'
}

function colorForSize(size: number): FileColorName {
  const thresholds = [
    1_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000,
    100_000_000_000,
  ]
  const colors: FileColorName[] = [
    'green',
    'cyan',
    'blue',
    'purple',
    'pink',
    'orange',
    'yellow',
    'red',
  ]
  const range = thresholds.findIndex((threshold) => size < threshold)

  return colors[range === -1 ? colors.length - 1 : range] ?? 'red'
}

export function colorForFileValue(
  column: string,
  value: unknown,
  referenceDate: Date,
): FileColorName | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  if (column === 'name' && typeof value === 'string') {
    return colorForFileName(value)
  }

  if (value instanceof Date) {
    return colorForDate(value, referenceDate)
  }

  if (column === 'size' && typeof value === 'number') {
    return colorForSize(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'green' : 'red'
  }

  const stableValue = Array.isArray(value) ? value.join(',') : String(value)

  return colorForStableValue(`${column}:${stableValue}`)
}
