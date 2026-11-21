import type { Folder } from '../components/files/Files.js'

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

export function locationUrl(path: string) {
  return `/location?${new URLSearchParams({ path })}`
}

export function locationBreadcrumbs(path: string) {
  const normalized = path.replaceAll('\\', '/')
  let normalizedRoot = normalized.match(/^[a-z]:\//i)?.[0] ?? ''

  if (/^\/\/\?\/UNC\//i.test(normalized)) {
    normalizedRoot =
      normalized.match(/^\/\/\?\/UNC\/[^/]+\/[^/]+\/?/i)?.[0] ?? ''
  } else if (normalized.startsWith('//?/')) {
    normalizedRoot = normalized.match(/^\/\/\?\/[a-z]:\//i)?.[0] ?? ''
  } else if (normalized.startsWith('//')) {
    normalizedRoot = normalized.match(/^\/\/[^/]+\/[^/]+\/?/)?.[0] ?? '/'
  } else if (normalized.startsWith('/')) {
    normalizedRoot = '/'
  }

  if (!normalizedRoot) {
    return []
  }

  // Keep verbatim Windows paths in links and show the familiar root label.
  const root = path.slice(0, normalizedRoot.length)
  const separator = path.includes('\\') ? '\\' : '/'
  const segments = normalized.slice(root.length).split('/').filter(Boolean)

  return [
    {
      name: normalizedRoot
        .replace(/^\/\/\?\/UNC\//i, '//')
        .replace(/^\/\/\?\//, ''),
      path: root,
    },
    ...segments.map((name, index) => ({
      name,
      path: root + segments.slice(0, index + 1).join(separator),
    })),
  ]
}
