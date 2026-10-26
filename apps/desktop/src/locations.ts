import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'
import type { Volume } from '@filejam/server'
import { app } from 'electron'
import { resolveDefaultFolder } from './defaultFolders.js'

export type LocationId =
  | 'applications'
  | 'desktop'
  | 'downloads'
  | 'documents'
  | 'music'
  | 'pictures'
  | 'trash'

export type PresentedLocation = {
  id: LocationId
  name: string
  volumeId: number
  relativePath: string
}

const locations: Array<{
  id: Exclude<LocationId, 'trash'>
  name: string
}> = [
  { id: 'applications', name: 'Applications' },
  { id: 'desktop', name: 'Desktop' },
  { id: 'downloads', name: 'Downloads' },
  { id: 'documents', name: 'Documents' },
  { id: 'music', name: 'Music' },
  { id: 'pictures', name: 'Pictures' },
]

export async function resolveLocations(
  volumes: Volume[],
): Promise<PresentedLocation[]> {
  const resolved: PresentedLocation[] = []

  for (const location of locations) {
    try {
      const path = resolveDefaultFolder(location.id, (name) =>
        app.getPath(name),
      )
      const destination = await resolveDestination(path, volumes)

      if (destination) {
        resolved.push({ ...location, ...destination })
      }
    } catch {
      // Known folders may be disabled or unavailable on the current machine.
    }
  }

  const trash = volumes.find((volume) => volume.isTrash)

  if (trash) {
    resolved.push({
      id: 'trash',
      name: 'Trash',
      volumeId: trash.id,
      relativePath: '',
    })
  }

  return resolved
}

async function resolveDestination(path: string, volumes: Volume[]) {
  if (!isAbsolute(path) || !(await stat(path)).isDirectory()) {
    return null
  }

  const canonical = await realpath(path)
  const candidates = volumes
    .filter((volume) => !volume.isTrash)
    .flatMap((volume) => {
      const child = relative(volume.rootPath, canonical)

      if (
        child === '' ||
        (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
      ) {
        return [{ volume, child }]
      }

      return []
    })
    .sort((a, b) => b.volume.rootPath.length - a.volume.rootPath.length)
  const match = candidates[0]

  return match
    ? {
        volumeId: match.volume.id,
        relativePath: match.child.split(sep).join('/'),
      }
    : null
}
