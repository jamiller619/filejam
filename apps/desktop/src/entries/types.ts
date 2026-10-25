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

export type PresentedEntry = FolderListing['entries'][number] & {
  presentation?: EntryResolution | null
}

export type PresentedFolderListing = Omit<FolderListing, 'entries'> & {
  entries: PresentedEntry[]
}
