import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EntryPlatform } from '@filejam/plugin-api'
import {
  applicationsManifest,
  createApplicationsProvider,
  type ShortcutDetails,
} from './applications.js'
import { EntryRegistry } from './registry.js'

export async function createEntryRegistry(
  userData: string,
  readShortcut: (path: string) => ShortcutDetails,
  platform: EntryPlatform = process.platform as EntryPlatform,
) {
  const registry = new EntryRegistry(platform, (message) =>
    console.info(message),
  )

  registry.register(
    applicationsManifest,
    createApplicationsProvider(readShortcut),
  )

  let packages: string[] = []

  try {
    const config = JSON.parse(
      await readFile(join(userData, 'entry-providers.json'), 'utf8'),
    )

    if (
      !config ||
      !Array.isArray(config.packages) ||
      !config.packages.every((item: unknown) => typeof item === 'string')
    ) {
      throw new Error('Invalid entry provider configuration')
    }

    packages = config.packages
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Entry provider configuration could not be loaded', error)
    }
  }

  const base = dirname(fileURLToPath(import.meta.url))

  for (const packageName of packages) {
    try {
      await registry.registerPackage(packageName, base)
    } catch (error) {
      console.error(`Entry provider rejected: ${packageName}`, error)
    }
  }

  return registry
}
