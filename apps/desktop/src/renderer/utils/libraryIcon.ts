import type { IconName } from '@files/ui'

const folderIcons: Readonly<Partial<Record<string, IconName>>> = {
  desktop: 'desktop',
  music: 'music',
  videos: 'videos',
  pictures: 'image',
  downloads: 'download',
  documents: 'documents',
}

export function getLibraryIcon(name: string): IconName {
  return folderIcons[name.toLowerCase()] ?? 'folder'
}
