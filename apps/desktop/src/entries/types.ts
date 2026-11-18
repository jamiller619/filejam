import type { EntryResolution } from '@filejam/plugin-api'
import type { ServerApi } from '@filejam/server'

export type FolderView = {
  recursive: boolean
  showDirectories: boolean
  allowFlattenToggle: boolean
}

export type PresentedLibrary = Awaited<
  ReturnType<ServerApi['libraries']['list']>
>[number] & {
  folderView: FolderView | null
}

type FolderListing = Awaited<ReturnType<ServerApi['entries']['listChildren']>>

export type PresentedEntry = Omit<
  FolderListing['entries'][number],
  'createdAt' | 'indexedAt'
> & {
  absolutePath?: string
  createdAt: Date | null
  indexedAt: Date | null
  presentation?: EntryResolution | null
}

export type PresentedFolderListing = Omit<
  FolderListing,
  'entries' | 'folder'
> & {
  folder: PresentedEntry | null
  entries: PresentedEntry[]
}
