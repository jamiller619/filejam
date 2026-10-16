import { formatDistanceToNow } from 'date-fns'

type FileEntry = Awaited<
  ReturnType<Window['files']['entries']['listChildren']>
>['entries'][number]

export type FileColumn = keyof FileEntry

export const fileColumnLabels: Record<FileColumn, string> = {
  tags: 'Tags',
  appTags: 'App tags',
  osTags: 'OS tags',
  embeddedTags: 'Embedded tags',
  tagReadError: 'Tag import issue',
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

export function formatFullPath(rootPath: string, relativePath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/'
  const root = rootPath.replace(/[\\/]+$/, '')
  return `${root}${separator}${relativePath.split('/').join(separator)}`
}

export function formatFileValueTitle(
  entry: FileEntry,
  column: FileColumn,
): string | undefined {
  const value = entry[column]
  if (column === 'modifiedAt' && value instanceof Date) {
    return dateFormatter.format(value)
  }
  return undefined
}

export function formatFileValue(entry: FileEntry, column: FileColumn): string {
  const value = entry[column]
  if (value === null || value === undefined) return '—'
  if (column === 'modifiedAt' && value instanceof Date) {
    return formatDistanceToNow(value, { addSuffix: true })
  }
  if (value instanceof Date) return dateFormatter.format(value)
  if (column === 'size' && typeof value === 'number') {
    if (value === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const index = Math.min(
      Math.floor(Math.log(value) / Math.log(1000)),
      units.length - 1,
    )
    return `${sizeFormatter.format(value / 1000 ** index)} ${units[index]}`
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  return String(value)
}
