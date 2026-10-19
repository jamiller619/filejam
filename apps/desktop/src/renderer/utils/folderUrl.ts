import type { Folder } from '../components/Files.js'

export function folderUrl(folder: Folder) {
  const query = new URLSearchParams({ folder: folder.relativePath })

  return `/libraries/${folder.libraryId}${folder.relativePath ? `?${query}` : ''}`
}
