import type { IconName } from '@filejam/ui'

const folderIcons: Readonly<Partial<Record<string, IconName>>> = {
  applications: 'grid',
  desktop: 'desktop',
  music: 'music',
  videos: 'video',
  pictures: 'image',
  downloads: 'download',
  documents: 'document',
}

export function getLibraryIcon(name: string): IconName {
  return folderIcons[name.toLowerCase()] ?? 'folder'
}
