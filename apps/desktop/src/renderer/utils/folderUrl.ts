import type { Folder } from '../components/files/Files.js'

export function folderUrl(folder: Folder) {
  const query = new URLSearchParams({ path: folder.relativePath })

  return `/browse/${folder.volumeId}${folder.relativePath ? `?${query}` : ''}`
}

export function isCurrentFolderUrl(
  location: { pathname: string; search: string },
  folder: Folder,
) {
  if (location.pathname !== `/browse/${folder.volumeId}`) {
    return false
  }

  const currentRelativePath =
    new URLSearchParams(location.search).get('path') ?? ''

  return currentRelativePath === folder.relativePath
}
