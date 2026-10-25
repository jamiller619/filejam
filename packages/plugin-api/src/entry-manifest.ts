import type { EntryApiVersion } from './entry-provider.js'

export type EntryKind = 'directory' | 'file' | 'symlink'
export type EntryPlatform = 'darwin' | 'linux' | 'win32'

export interface FolderViewContribution {
  typeId: string
  platforms?: EntryPlatform[]
  view: {
    recursive: boolean
    showDirectories: boolean
    allowFlattenToggle: boolean
  }
}

export interface EntryTypeContribution {
  typeId: string
  platforms?: EntryPlatform[]
  kinds: EntryKind[]
  extensions: string[]
}

export interface EntryManifest {
  id: string
  version: string
  apiVersion: EntryApiVersion
  folders: FolderViewContribution[]
  entries: EntryTypeContribution[]
}
