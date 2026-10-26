import type { FileColumn } from '../../utils/fileColumns.js'

export const selectedFileColor = { light: '#f9feff', dark: '#0d141f' }

export const defaultFileColumns: readonly FileColumn[] = [
  'name',
  'createdAt',
  'modifiedAt',
  'size',
]

export const minimumNameColumnWidth = 240

export const defaultColumnWidths: Partial<Record<FileColumn, number>> = {
  name: minimumNameColumnWidth,
  relativePath: 260,
  mimeType: 200,
  createdAt: 180,
  modifiedAt: 180,
  indexedAt: 180,
  childrenScannedAt: 180,
  kind: 130,
  childrenDirty: 130,
  size: 110,
  id: 110,
  volumeId: 110,
  parentId: 110,
}

export function getColumnWidth(column: FileColumn) {
  return defaultColumnWidths[column] ?? 150
}
