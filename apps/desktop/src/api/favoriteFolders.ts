import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ServerApi } from '@files/server'

export function createFavoriteFoldersHandler(
  api: ServerApi,
  scanRoot?: (root: string) => Promise<unknown>,
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
        // Validate the entire drop before changing libraries or preferences.
        for (const path of paths) {
          if (!(await stat(path)).isDirectory())
            throw new Error('Only folders can be added to Favorites.')
        }
        const libraries = await api.libraries.list()
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
            libraries.some(
              (library) => library.isTrash && contains(library.rootPath, path),
            )
          ) {
            throw new Error('Trash folders cannot be added to Favorites.')
          }
        }
        for (const path of paths) {
          if (!libraries.some((library) => contains(library.rootPath, path))) {
            await api.libraries.ensureRoot(path)
            await scanRoot?.(path)
          }
        }
        const favorites = await api.config.get('user.favoriteFolders')
        const key = (path: string) =>
          process.platform === 'win32'
            ? resolve(path).toLowerCase()
            : resolve(path)
        const known = new Set(favorites.map(key))
        const updated = [...favorites]
        for (const path of paths) {
          if (!known.has(key(path))) updated.push(path)
          known.add(key(path))
        }
        await api.config.set('user.favoriteFolders', updated)
        return updated
      })
    pending = operation
    return operation
  }
}
