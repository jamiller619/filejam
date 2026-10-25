import { pathToFileURL } from 'node:url'
import type { ServerApi } from '@filejam/server'
import mime from 'mime'
import type { EntryRegistry } from '../entries/registry.js'
import { authorizePreview, PreviewAccessError } from './authorize.js'
import type { FileIconProvider } from './file-icons.js'
import { previewMimeType } from './formats.js'
import { previewIcon } from './icons.js'
import type { PreviewService } from './service.js'

const baseHeaders = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
}

const noStoreHeaders = {
  ...baseHeaders,
  'Cache-Control': 'no-store',
}

const immutableHeaders = {
  ...baseHeaders,
  'Cache-Control': 'private, max-age=31536000, immutable',
}

export function createPreviewHandler(
  libraries: Pick<ServerApi['libraries'], 'list'>,
  fetchFile: (url: string, init?: RequestInit) => Promise<Response>,
  service?: PreviewService,
  fileIcon?: FileIconProvider,
  entryRegistry?: EntryRegistry,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405 })
    }

    const url = new URL(request.url)
    const libraryId = Number(url.searchParams.get('libraryId'))
    const path = url.searchParams.get('path')

    if (
      !Number.isSafeInteger(libraryId) ||
      libraryId <= 0 ||
      path === null ||
      path.includes('\0') ||
      (url.pathname !== '' && url.pathname !== '/')
    ) {
      return new Response(null, { status: 400 })
    }

    if (url.host === 'video') {
      try {
        const { file, info } = await authorizePreview(
          libraries,
          libraryId,
          path,
        )
        const mimeType = mime.getType(file)

        if (!info.isFile() || !mimeType?.startsWith('video/')) {
          return new Response(null, { status: 415 })
        }

        const range = request.headers.get('range')
        const response = await fetchFile(
          pathToFileURL(file).href,
          range ? { headers: { Range: range } } : undefined,
        )
        const contentLength = response.headers.get('content-length')
        const contentRange = response.headers.get('content-range')

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...noStoreHeaders,
            'Accept-Ranges': response.headers.get('accept-ranges') ?? 'bytes',
            'Content-Type': mimeType,
            ...(contentLength ? { 'Content-Length': contentLength } : {}),
            ...(contentRange ? { 'Content-Range': contentRange } : {}),
          },
        })
      } catch (error) {
        return new Response(null, {
          status: error instanceof PreviewAccessError ? error.status : 404,
        })
      }
    }

    const color = url.searchParams.get('color')
    const darkColor = url.searchParams.get('darkColor')

    const dimension = (name: string) =>
      Number(url.searchParams.get(name) ?? 256)

    const width = dimension('width')
    const height = dimension('height')
    const original = url.searchParams.get('original') === '1'
    const fallbackRequested = url.searchParams.get('fallback') === '1'
    const responseHeaders =
      url.searchParams.has('v') && !original ? immutableHeaders : noStoreHeaders

    if (
      url.host !== 'preview-image' ||
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
      const variant =
        url.searchParams.get('variant') === 'grid' ? 'grid' : 'list'
      const presentation = entryRegistry
        ? await entryRegistry.resolve({
            path: file,
            name:
              library.rootPath === file
                ? library.name
                : (path.split('/').at(-1) ?? path),
            kind: info.isDirectory()
              ? 'directory'
              : info.isSymbolicLink()
                ? 'symlink'
                : 'file',
          })
        : null

      const fallbackIcon = async () =>
        new Response(
          await previewIcon({
            directory: info.isDirectory(),
            variant,
            libraryName: file === root ? library.name : undefined,
            color: color ?? '#7ce2fe',
            darkColor: darkColor ?? undefined,
          }),
          {
            headers: {
              ...responseHeaders,
              'Content-Type': 'image/svg+xml',
            },
          },
        )

      const icon = async () => {
        if (original) {
          return new Response(null, { status: 415 })
        }

        // Let the renderer retry with a marked fallback URL. That marker lets
        // CSS cap low-resolution OS artwork without shrinking real previews.
        if (fileIcon && info.isFile() && !fallbackRequested) {
          return new Response(null, { status: 415 })
        }

        if (fileIcon && info.isFile()) {
          const iconPath =
            presentation?.icon?.type === 'native'
              ? presentation.icon.path
              : file
          const nativeIcon = await fileIcon(iconPath, variant)

          if (nativeIcon) {
            return new Response(nativeIcon, {
              headers: {
                ...responseHeaders,
                'Content-Type': 'image/png',
              },
            })
          }
        }

        return fallbackIcon()
      }

      if (!info.isFile() || fallbackRequested) {
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
            headers: { ...responseHeaders, 'Content-Type': result.mimeType },
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
          headers: { ...responseHeaders, 'Content-Type': mimeType },
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
