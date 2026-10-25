import { formatDistanceToNow } from 'date-fns'
import type { Settings } from '../../settings/settings.js'

type FileEntry = Awaited<
  ReturnType<Window['filejam']['entries']['listChildren']>
>['entries'][number]

export type FileColumn = keyof FileEntry
export type DateFormat = Settings['user.dateformat']

export const fileColumnLabels: Record<FileColumn, string> = {
  id: 'ID',
  libraryId: 'Library ID',
  parentId: 'Parent ID',
  name: 'Name',
  relativePath: 'Path',
  kind: 'Kind',
  size: 'Size',
  mimeType: 'MIME type',
  createdAt: 'Date created',
  modifiedAt: 'Date modified',
  indexedAt: 'Date indexed',
  childrenScannedAt: 'Date scanned',
  childrenDirty: 'Scan incomplete',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const sizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
})

export function formatFileSize(size: number): string {
  if (size === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1000)),
    units.length - 1,
  )

  return `${sizeFormatter.format(size / 1000 ** index)} ${units[index]}`
}

export function formatFullPath(rootPath: string, relativePath: string): string {
  if (!relativePath) {
    return rootPath
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  const root = rootPath.replace(/[\\/]+$/, '')

  return `${root}${separator}${relativePath.split('/').join(separator)}`
}

export function formatFileValueTitle(
  entry: FileEntry,
  column: FileColumn,
  dateFormat: DateFormat,
): string | undefined {
  const value = entry[column]

  if (dateFormat === 'relative' && value instanceof Date) {
    return dateFormatter.format(value)
  }

  return undefined
}

export function formatFileValue(
  entry: FileEntry,
  column: FileColumn,
  dateFormat: DateFormat,
): string {
  const value = entry[column]

  if (value === null || value === undefined) {
    return '—'
  }

  if (value instanceof Date) {
    return dateFormat === 'relative'
      ? formatDistanceToNow(value, { addSuffix: true })
      : dateFormatter.format(value)
  }

  if (column === 'size' && typeof value === 'number') {
    return formatFileSize(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '—'
  }

  return String(value)
}
