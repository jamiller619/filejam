import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  EntryKind,
  EntryManifest,
  EntryPlatform,
  EntryProvider,
  EntryRequest,
  EntryResolution,
  FolderViewContribution,
} from '@filejam/plugin-api'

type RegisteredProvider = {
  manifest: EntryManifest
  provider: EntryProvider
}

export class EntryRegistry {
  readonly providers: RegisteredProvider[] = []

  constructor(
    private readonly platform: EntryPlatform,
    private readonly log: (message: string) => void = () => undefined,
  ) {}

  register(manifest: EntryManifest, provider: EntryProvider) {
    validateManifest(manifest)

    if (this.providers.some((item) => item.manifest.id === manifest.id)) {
      throw new Error(`Duplicate entry provider: ${manifest.id}`)
    }

    this.providers.push({ manifest, provider })
  }

  async registerPackage(packagePath: string, base: string) {
    const require = createRequire(
      pathToFileURL(resolve(base, 'entry-loader.cjs')),
    )
    const manifestPath = isAbsolute(packagePath)
      ? resolve(packagePath, 'package.json')
      : require.resolve(`${packagePath}/package.json`)

    const pkg = JSON.parse(await readFile(manifestPath, 'utf8'))
    const app = pkg.filejamApp

    if (
      typeof pkg.name !== 'string' ||
      !pkg.name ||
      typeof pkg.version !== 'string' ||
      !pkg.version ||
      typeof pkg.main !== 'string' ||
      app?.type !== 'entry'
    ) {
      throw new Error('Invalid entry provider package')
    }

    const root = dirname(manifestPath)
    const entry = resolve(root, pkg.main)

    if (isAbsolute(pkg.main) || relative(root, entry).startsWith('..')) {
      throw new Error('Provider entry must be inside its package')
    }

    const module = await import(pathToFileURL(entry).href)
    const provider = (module.default ?? module) as EntryProvider

    if (typeof provider.resolve !== 'function') {
      throw new Error('Entry provider must export resolve()')
    }

    this.register(
      {
        id: pkg.name,
        version: pkg.version,
        apiVersion: app.apiVersion,
        folders: app.folders,
        entries: app.entries,
      },
      provider,
    )
  }

  folderView(typeId: string | null | undefined) {
    if (!typeId) {
      return null
    }

    for (const { manifest } of this.providers) {
      const contribution = manifest.folders.find(
        (folder) => folder.typeId === typeId && this.supports(folder.platforms),
      )

      if (contribution) {
        return structuredClone(contribution.view)
      }
    }

    return null
  }

  async resolve(request: EntryRequest): Promise<EntryResolution | null> {
    const extension = extname(request.name).slice(1).toLowerCase()

    for (const { manifest, provider } of this.providers) {
      const types = manifest.entries.filter(
        (entry) =>
          this.supports(entry.platforms) &&
          entry.kinds.includes(request.kind) &&
          entry.extensions.includes(extension),
      )

      if (!types.length) {
        continue
      }

      const resolution = await provider.resolve(request, {
        signal: AbortSignal.timeout(5_000),
        log: (message) => this.log(`[${manifest.id}] ${message}`),
      })

      if (!resolution) {
        continue
      }

      if (!types.some((entry) => entry.typeId === resolution.typeId)) {
        throw new Error(
          `Entry provider ${manifest.id} returned an undeclared type`,
        )
      }

      return structuredClone(resolution)
    }

    return null
  }

  private supports(platforms: EntryPlatform[] | undefined) {
    return !platforms || platforms.includes(this.platform)
  }
}

function validateManifest(manifest: EntryManifest) {
  if (
    !manifest ||
    typeof manifest.id !== 'string' ||
    !manifest.id ||
    typeof manifest.version !== 'string' ||
    !manifest.version ||
    manifest.apiVersion !== 1 ||
    !Array.isArray(manifest.folders) ||
    !manifest.folders.every(validFolder) ||
    !Array.isArray(manifest.entries) ||
    !manifest.entries.every(validEntry)
  ) {
    throw new Error('Invalid or incompatible entry manifest')
  }
}

function validFolder(folder: FolderViewContribution) {
  return (
    validTypeId(folder?.typeId) &&
    validPlatforms(folder.platforms) &&
    typeof folder.view?.recursive === 'boolean' &&
    typeof folder.view?.showDirectories === 'boolean' &&
    typeof folder.view?.allowFlattenToggle === 'boolean'
  )
}

function validEntry(entry: EntryManifest['entries'][number]) {
  const kinds: EntryKind[] = ['directory', 'file', 'symlink']

  return (
    validTypeId(entry?.typeId) &&
    validPlatforms(entry.platforms) &&
    Array.isArray(entry.kinds) &&
    entry.kinds.length > 0 &&
    entry.kinds.every((kind) => kinds.includes(kind)) &&
    Array.isArray(entry.extensions) &&
    entry.extensions.length > 0 &&
    entry.extensions.every(
      (extension) =>
        typeof extension === 'string' && /^[a-z0-9]+$/.test(extension),
    )
  )
}

function validTypeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9@][a-z0-9@./-]+$/.test(value)
}

function validPlatforms(platforms: EntryPlatform[] | undefined) {
  return (
    platforms === undefined ||
    (Array.isArray(platforms) &&
      platforms.every((platform) =>
        ['darwin', 'linux', 'win32'].includes(platform),
      ))
  )
}
