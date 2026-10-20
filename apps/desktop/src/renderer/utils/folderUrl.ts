import type { Folder } from '../components/Files.js'

export function folderUrl(folder: Folder) {
  const query = new URLSearchParams({ folder: folder.relativePath })

  return `/libraries/${folder.libraryId}${folder.relativePath ? `?${query}` : ''}`
}

export function isCurrentFolderUrl(
  location: { pathname: string; search: string },
  folder: Folder,
) {
  if (location.pathname !== `/libraries/${folder.libraryId}`) {
    return false
  }

  const currentRelativePath =
    new URLSearchParams(location.search).get('folder') ?? ''

  return currentRelativePath === folder.relativePath
}
