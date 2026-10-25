import type { EntryResolution } from '@filejam/plugin-api'
import type { Row, Table } from '@tanstack/react-table'
import type { FileColumn } from '../../utils/fileColumns.js'

export type Folder = Parameters<Window['filejam']['entries']['listChildren']>[0]

export type FolderListing = Awaited<
  ReturnType<Window['filejam']['entries']['listChildren']>
>

type CollectionListing = Awaited<
  ReturnType<Window['filejam']['collections']['listEntries']>
>

export type FileEntry = (
  | FolderListing['entries'][number]
  | CollectionListing['entries'][number]
) & {
  presentation?: EntryResolution | null
}

export type Listing = (
  | Omit<FolderListing, 'entries'>
  | Omit<CollectionListing, 'entries'>
) & { entries: FileEntry[] }

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
