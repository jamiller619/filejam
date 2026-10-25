import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mediaExecutables } from '../media/executables.js'
import { PreviewRegistry } from './registry.js'
import { PreviewService } from './service.js'

export async function createPreviewService(userData: string) {
  // Local configuration opts into executing installed packages with the user's
  // OS privileges. Utility processes provide crash isolation, not a sandbox.
  let config: { packages?: string[]; overrides?: Record<string, string> } = {}

  try {
    config = JSON.parse(
      await readFile(join(userData, 'preview-providers.json'), 'utf8'),
    )

    if (
      !config ||
      (config.packages !== undefined &&
        (!Array.isArray(config.packages) ||
          !config.packages.every((p) => typeof p === 'string'))) ||
      (config.overrides !== undefined &&
        (typeof config.overrides !== 'object' ||
          config.overrides === null ||
          !Object.values(config.overrides).every((p) => typeof p === 'string')))
    ) {
      throw new Error('Invalid preview configuration')
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Preview configuration could not be loaded', error)
    }

    config = {}
  }

  const registry = new PreviewRegistry(config.overrides)
  const base = dirname(fileURLToPath(import.meta.url))

  await registry.register('@filejam/preview-images', base)
  await registry.register('@filejam/preview-video', base)

  for (const name of config.packages ?? []) {
    try {
      await registry.register(name, userData)
    } catch (error) {
      console.error(`Preview package rejected: ${name}`, error)
    }
  }

  return new PreviewService(
    registry,
    join(userData, 'preview-cache'),
    mediaExecutables,
  )
}
