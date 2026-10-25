import { extname, normalize } from 'node:path'

export type FileIconSize = 'normal' | 'large'
export type FileIconVariant = 'list' | 'grid'
export type FileIconBytes = Uint8Array<ArrayBuffer>

export type LoadFileIcon = (
  file: string,
  size: FileIconSize,
) => Promise<FileIconBytes | null>

export type FileIconProvider = (
  file: string,
  variant: FileIconVariant,
) => Promise<FileIconBytes | null>

const pathSpecificExtensions = new Set([
  '.app',
  '.desktop',
  '.exe',
  '.icns',
  '.ico',
  '.lnk',
])

/** Cache associated type icons while preserving per-file application artwork. */
export function createFileIconProvider(
  load: LoadFileIcon,
  maximumEntries = 256,
): FileIconProvider {
  const cache = new Map<string, Promise<FileIconBytes | null>>()

  return (file, variant) => {
    const size = variant === 'grid' ? 'large' : 'normal'
    const extension = extname(file).toLowerCase()
    const identity = pathSpecificExtensions.has(extension)
      ? normalize(file)
      : extension || '<unknown>'
    const key = `${size}:${identity}`
    const cached = cache.get(key)

    if (cached) {
      cache.delete(key)
      cache.set(key, cached)

      return cached
    }

    const pending = load(file, size)
      .then((icon) => (icon?.byteLength ? icon : null))
      .catch(() => null)

    cache.set(key, pending)

    while (cache.size > maximumEntries) {
      const oldest = cache.keys().next().value

      if (oldest === undefined) {
        break
      }

      cache.delete(oldest)
    }

    return pending
  }
}
