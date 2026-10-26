import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ServerApi } from '@filejam/server'
import type { SettingsApi } from '../settings/index.js'

export function createFavoriteFoldersHandler(
  api: ServerApi,
  settings: SettingsApi,
) {
  let pending = Promise.resolve<string[]>([])

  return (input: unknown): Promise<string[]> => {
    const operation = pending
      .catch(() => [])
      .then(async () => {
        if (
          !Array.isArray(input) ||
          !input.length ||
          input.length > 100 ||
          input.some((path) => typeof path !== 'string' || !isAbsolute(path))
        ) {
          throw new Error('Drop folders with absolute paths.')
        }

        const paths = [
          ...new Set((input as string[]).map((path) => resolve(path))),
        ]

        // Validate the entire drop before changing preferences.
        for (const path of paths) {
          if (!(await stat(path)).isDirectory()) {
            throw new Error('Only folders can be added to Favorites.')
          }
        }

        const volumes = await api.volumes.list()

        const contains = (root: string, path: string) => {
          const child = relative(root, path)

          return (
            child === '' ||
            (!isAbsolute(child) &&
              child !== '..' &&
              !child.startsWith(`..${sep}`))
          )
        }

        for (const path of paths) {
          if (
            volumes.some(
              (volume) => volume.isTrash && contains(volume.rootPath, path),
            )
          ) {
            throw new Error('Trash folders cannot be added to Favorites.')
          }
        }

        for (const path of paths) {
          if (!volumes.some((volume) => contains(volume.rootPath, path))) {
            throw new Error('The folder is not on a mounted volume.')
          }
        }

        const favorites = await settings.get('user.favoriteFolders')

        const key = (path: string) =>
          process.platform === 'win32'
            ? resolve(path).toLowerCase()
            : resolve(path)

        const known = new Set(favorites.map(key))
        const updated = [...favorites]

        for (const path of paths) {
          if (!known.has(key(path))) {
            updated.push(path)
          }

          known.add(key(path))
        }

        await settings.set('user.favoriteFolders', updated)

        return updated
      })

    pending = operation

    return operation
  }
}
