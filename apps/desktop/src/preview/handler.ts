import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ServerApi } from '@files/server'
import { previewMimeType } from './formats.js'

export function createPreviewHandler(
  entries: Pick<ServerApi['entries'], 'getFileSource'>,
  fetchFile: (url: string) => Promise<Response>,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const url = new URL(request.url)
    if (url.host !== 'file' || !/^\/[1-9]\d*$/.test(url.pathname)) {
      return new Response(null, { status: 400 })
    }
    try {
      const source = await entries.getFileSource(Number(url.pathname.slice(1)))
      if (!source) return new Response(null, { status: 404 })
      const mimeType = previewMimeType(source.name || source.relativePath)
      if (!mimeType) return new Response(null, { status: 415 })
      const root = await realpath(source.rootPath)
      const file = await realpath(resolve(root, source.relativePath))
      const withinRoot = relative(root, file)
      if (
        !withinRoot ||
        isAbsolute(withinRoot) ||
        withinRoot === '..' ||
        withinRoot.startsWith(`..${sep}`)
      ) {
        return new Response(null, { status: 403 })
      }
      if (!(await stat(file)).isFile())
        return new Response(null, { status: 404 })
      const response = await fetchFile(pathToFileURL(file).href)
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': mimeType,
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}
