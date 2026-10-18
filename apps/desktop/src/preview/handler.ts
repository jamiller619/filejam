import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ServerApi } from '@files/server'
import { previewMimeType } from './formats.js'
import { previewIcon } from './icons.js'

const headers = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

function withinRoot(root: string, file: string) {
  const path = relative(root, file)
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)
}

export function createPreviewHandler(
  libraries: Pick<ServerApi['libraries'], 'list'>,
  fetchFile: (url: string) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const url = new URL(request.url)
    const libraryId = Number(url.searchParams.get('libraryId'))
    const path = url.searchParams.get('path')
    const color = url.searchParams.get('color')
    if (
      url.host !== 'preview-image' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      !Number.isSafeInteger(libraryId) ||
      libraryId <= 0 ||
      path === null ||
      path.includes('\0') ||
      (color !== null && !/^#[\da-f]{6}$/i.test(color))
    )
      return new Response(null, { status: 400 })

    try {
      const library = (await libraries.list()).find(
        ({ id }) => id === libraryId,
      )
      if (!library) return new Response(null, { status: 404 })

      const root = await realpath(library.rootPath)
      const candidate = resolve(root, path)

      if (isAbsolute(path) || !withinRoot(root, candidate)) {
        return new Response(null, { status: 403 })
      }

      const file = await realpath(candidate)

      if (!withinRoot(root, file)) return new Response(null, { status: 403 })

      const info = await stat(file)
      const icon = async () =>
        new Response(
          await previewIcon({
            directory: info.isDirectory(),
            variant:
              url.searchParams.get('variant') === 'grid' ? 'grid' : 'list',
            libraryName: file === root ? library.name : undefined,
            color: color ?? '#7ce2fe',
          }),
          { headers: { ...headers, 'Content-Type': 'image/svg+xml' } },
        )

      const mimeType = previewMimeType(file)
      if (
        !info.isFile() ||
        !mimeType ||
        url.searchParams.get('fallback') === '1'
      ) {
        return await icon()
      }

      try {
        const response = await fetchFile(pathToFileURL(file).href)

        if (!response.ok) return await icon()

        return new Response(response.body, {
          headers: { ...headers, 'Content-Type': mimeType },
        })
      } catch {
        return await icon()
      }
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}
