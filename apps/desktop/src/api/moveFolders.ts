import { constants } from 'node:fs'
import { access, cp, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ServerApi } from '@filejam/server'

function pathKey(path: string) {
  const resolved = resolve(path)

  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function containsPath(root: string, path: string) {
  const child = relative(root, path)

  return (
    child === '' ||
    (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
  )
}

async function pathExists(path: string) {
  try {
    await access(path, constants.F_OK)

    return true
  } catch {
    return false
  }
}

async function moveFolder(source: string, target: string) {
  try {
    await rename(source, target)
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'EXDEV')
    ) {
      throw error
    }

    await cp(source, target, {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
    })

    try {
      await rm(source, { recursive: true })
    } catch (error) {
      await rm(target, { recursive: true, force: true })

      throw error
    }
  }
}

export function createMoveFoldersHandler(
  api: ServerApi,
  scanRoot?: (root: string) => Promise<unknown>,
) {
  let pending = Promise.resolve<string[]>([])

  return (input: unknown, destinationInput: unknown): Promise<string[]> => {
    const operation = pending
      .catch(() => [])
      .then(async () => {
        if (
          !Array.isArray(input) ||
          !input.length ||
          input.length > 100 ||
          input.some((path) => typeof path !== 'string' || !isAbsolute(path)) ||
          typeof destinationInput !== 'string' ||
          !isAbsolute(destinationInput)
        ) {
          throw new Error('Move folders using absolute paths.')
        }

        const sources = [
          ...new Map(
            (input as string[]).map((path) => [pathKey(path), resolve(path)]),
          ).values(),
        ]
        const destination = await realpath(destinationInput)

        if (!(await stat(destination)).isDirectory()) {
          throw new Error('Folders can only be moved into another folder.')
        }

        const libraries = (await api.libraries.list()).filter(
          (library) => !library.isTrash,
        )
        const destinationLibrary = libraries.find((library) =>
          containsPath(library.rootPath, destination),
        )

        if (!destinationLibrary) {
          throw new Error('The destination must be inside a library.')
        }

        const moves: Array<{
          source: string
          target: string
          sourceRoot: string
        }> = []

        for (const unresolvedSource of sources) {
          const source = await realpath(unresolvedSource)

          if (!(await stat(source)).isDirectory()) {
            throw new Error('Only folders can be moved.')
          }

          const sourceLibrary = libraries.find((library) =>
            containsPath(library.rootPath, source),
          )

          if (
            !sourceLibrary ||
            pathKey(source) === pathKey(sourceLibrary.rootPath)
          ) {
            throw new Error('Library roots cannot be moved.')
          }

          if (containsPath(source, destination)) {
            throw new Error('A folder cannot be moved into itself.')
          }

          const target = join(destination, basename(source))

          if (await pathExists(target)) {
            throw new Error(
              `A folder named "${basename(source)}" already exists.`,
            )
          }

          moves.push({ source, target, sourceRoot: sourceLibrary.rootPath })
        }

        const targetKeys = new Set<string>()

        for (const [index, move] of moves.entries()) {
          if (
            moves.some(
              (other, otherIndex) =>
                otherIndex !== index && containsPath(other.source, move.source),
            )
          ) {
            throw new Error('Nested folders cannot be moved together.')
          }

          const target = pathKey(move.target)

          if (targetKeys.has(target)) {
            throw new Error('Moved folders must have unique names.')
          }

          targetKeys.add(target)
        }

        const history = await api.moveHistory.plan(
          moves.map((move) => ({
            sourcePath: move.source,
            targetPath: move.target,
          })),
        )

        try {
          for (const [index, move] of moves.entries()) {
            const historyItem = history.items[index]

            if (!historyItem) {
              throw new Error('Move history is incomplete.')
            }

            await moveFolder(move.source, move.target)
            await api.moveHistory.markItemMoved(historyItem.id)
          }

          await api.moveHistory.complete(history.id)
        } catch (error) {
          await api.moveHistory.fail(history.id, error)

          throw error
        }

        const favorites = await api.config.get('user.favoriteFolders')
        const updatedFavorites = favorites.map((favorite) => {
          const move = moves.find(({ source }) =>
            containsPath(source, favorite),
          )

          return move
            ? join(move.target, relative(move.source, favorite))
            : favorite
        })

        if (updatedFavorites.some((path, index) => path !== favorites[index])) {
          await api.config.set('user.favoriteFolders', updatedFavorites)
        }

        const roots = new Set([
          destinationLibrary.rootPath,
          ...moves.map((move) => move.sourceRoot),
        ])

        await Promise.all([...roots].map((root) => scanRoot?.(root)))

        return updatedFavorites
      })

    pending = operation

    return operation
  }
}
