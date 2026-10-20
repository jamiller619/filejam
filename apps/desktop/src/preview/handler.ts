import { pathToFileURL } from 'node:url'
import type { ServerApi } from '@files/server'
import { authorizePreview, PreviewAccessError } from './authorize.js'
import { previewMimeType } from './formats.js'
import { previewIcon } from './icons.js'
import type { PreviewService } from './service.js'

const headers = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

export function createPreviewHandler(
  libraries: Pick<ServerApi['libraries'], 'list'>,
  fetchFile: (url: string) => Promise<Response>,
  service?: PreviewService,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405 })
    }

    const url = new URL(request.url)
    const libraryId = Number(url.searchParams.get('libraryId'))
    const path = url.searchParams.get('path')
    const color = url.searchParams.get('color')
    const darkColor = url.searchParams.get('darkColor')

    const dimension = (name: string) =>
      Number(url.searchParams.get(name) ?? 256)

    const width = dimension('width')
    const height = dimension('height')

    if (
      url.host !== 'preview-image' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      !Number.isSafeInteger(libraryId) ||
      libraryId <= 0 ||
      path === null ||
      path.includes('\0') ||
      ![width, height].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 2048,
      ) ||
      (color !== null && !/^#[\da-f]{6}$/i.test(color)) ||
      (darkColor !== null && !/^#[\da-f]{6}$/i.test(darkColor))
    ) {
      return new Response(null, { status: 400 })
    }

    try {
      const { file, root, library, info } = await authorizePreview(
        libraries,
        libraryId,
        path,
      )

      const original = url.searchParams.get('original') === '1'

      const icon = async () =>
        original
          ? new Response(null, { status: 415 })
          : new Response(
              await previewIcon({
                directory: info.isDirectory(),
                variant:
                  url.searchParams.get('variant') === 'grid' ? 'grid' : 'list',
                libraryName: file === root ? library.name : undefined,
                color: color ?? '#7ce2fe',
                darkColor: darkColor ?? undefined,
              }),
              { headers: { ...headers, 'Content-Type': 'image/svg+xml' } },
            )

      if (!info.isFile() || url.searchParams.get('fallback') === '1') {
        return await icon()
      }

      try {
        if (!original && service) {
          const result = await service.generate(
            {
              source: { path: file, size: info.size, modifiedAt: info.mtimeMs },
              width,
              height,
              purpose:
                url.searchParams.get('purpose') === 'detail'
                  ? 'detail'
                  : 'thumbnail',
            },
            request.signal,
          )

          const current = await authorizePreview(libraries, libraryId, path)

          if (
            !result ||
            current.file !== file ||
            current.info.size !== info.size ||
            current.info.mtimeMs !== info.mtimeMs
          ) {
            return await icon()
          }

          return new Response(new Uint8Array(result.bytes), {
            headers: { ...headers, 'Content-Type': result.mimeType },
          })
        }

        const mimeType = previewMimeType(file)

        if (!mimeType) {
          return await icon()
        }

        const response = await fetchFile(pathToFileURL(file).href)

        if (!response.ok) {
          return await icon()
        }

        return new Response(response.body, {
          headers: { ...headers, 'Content-Type': mimeType },
        })
      } catch {
        return await icon()
      }
    } catch (error) {
      return new Response(null, {
        status: error instanceof PreviewAccessError ? error.status : 404,
      })
    }
  }
}
