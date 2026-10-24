import type { Row, Table } from '@tanstack/react-table'
import type { FileColumn } from '../../utils/fileColumns.js'

export type Folder = Parameters<Window['files']['entries']['listChildren']>[0]

export type FolderListing = Awaited<
  ReturnType<Window['files']['entries']['listChildren']>
>

export type Listing =
  | FolderListing
  | Awaited<ReturnType<Window['files']['collections']['listEntries']>>

export type FileEntry = Listing['entries'][number]
export type FileRow = Row<FileEntry>
export type FilesTableModel = Table<FileEntry>

export type FileRowGroup = {
  key: string
  label: string | null
  order: number | undefined
  rows: FileRow[]
}

export type FilesProps = {
  folder?: Folder | undefined
  collectionId?: string | undefined
  columns?: readonly FileColumn[]
  preferencesScope?: string | undefined
  reportFolderStats?: boolean | undefined
}
