import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ServerApi } from '@filejam/server'

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
  volumes: Pick<ServerApi['volumes'], 'list'>,
  volumeId: number,
  path: string,
) {
  if (
    !Number.isSafeInteger(volumeId) ||
    volumeId <= 0 ||
    path.includes('\0') // NULL byte check
  ) {
    throw new PreviewAccessError(400)
  }

  const volume = (await volumes.list()).find((item) => item.id === volumeId)

  if (!volume) {
    throw new PreviewAccessError(404)
  }

  const root = await realpath(volume.rootPath)
  const candidate = resolve(root, path)

  if (isAbsolute(path) || !withinRoot(root, candidate)) {
    throw new PreviewAccessError(403)
  }

  const file = await realpath(candidate)

  if (!withinRoot(root, file)) {
    throw new PreviewAccessError(403)
  }

  return { file, root, volume, info: await stat(file) }
}
