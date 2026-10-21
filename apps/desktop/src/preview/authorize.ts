import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ServerApi } from '@files/server'

export class PreviewAccessError extends Error {
  constructor(public status: number) {
    super(`Preview access denied (${status})`)
  }
}

function withinRoot(root: string, file: string) {
  const path = relative(root, file)

  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)
}

export async function authorizePreview(
  libraries: Pick<ServerApi['libraries'], 'list'>,
  libraryId: number,
  path: string,
) {
  if (
    !Number.isSafeInteger(libraryId) ||
    libraryId <= 0 ||
    path.includes('\0') // NULL byte check
  ) {
    throw new PreviewAccessError(400)
  }

  const library = (await libraries.list()).find((item) => item.id === libraryId)

  if (!library) {
    throw new PreviewAccessError(404)
  }

  const root = await realpath(library.rootPath)
  const candidate = resolve(root, path)

  if (isAbsolute(path) || !withinRoot(root, candidate)) {
    throw new PreviewAccessError(403)
  }

  const file = await realpath(candidate)

  if (!withinRoot(root, file)) {
    throw new PreviewAccessError(403)
  }

  return { file, root, library, info: await stat(file) }
}
