import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PreviewManifest } from '@filejam/plugin-api'
import mime from 'mime'

export interface RegisteredProvider {
  manifest: PreviewManifest
  entry: string
}

export class PreviewRegistry {
  readonly providers: RegisteredProvider[] = []

  constructor(private overrides: Record<string, string> = {}) {}

  async register(packagePath: string, base: string) {
    // Read inert metadata in the host; package code is only imported in a child.
    const require = createRequire(
      pathToFileURL(resolve(base, 'preview-loader.cjs')),
    )

    const manifestPath = isAbsolute(packagePath)
      ? resolve(packagePath, 'package.json')
      : require.resolve(`${packagePath}/package.json`)

    const pkg = JSON.parse(await readFile(manifestPath, 'utf8'))
    const app = pkg.filejamApp

    if (
      typeof pkg.name !== 'string' ||
      pkg.name.length === 0 ||
      typeof pkg.version !== 'string' ||
      pkg.version.length === 0 ||
      typeof pkg.main !== 'string' ||
      app?.type !== 'preview' ||
      app.apiVersion !== 1 ||
      !Array.isArray(app.extensions) ||
      !app.extensions.every(
        (v: unknown) => typeof v === 'string' && /^[a-z0-9]+$/.test(v),
      ) ||
      !Array.isArray(app.mimeTypes) ||
      !app.mimeTypes.every(
        (v: unknown) => typeof v === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(v),
      ) ||
      typeof app.capabilities?.original !== 'boolean'
    ) {
      throw new Error('Invalid or incompatible preview manifest')
    }

    const manifest: PreviewManifest = {
      id: pkg.name,
      version: pkg.version,
      apiVersion: app.apiVersion,
      extensions: app.extensions,
      mimeTypes: app.mimeTypes,
      capabilities: app.capabilities,
    }

    if (this.providers.some((p) => p.manifest.id === manifest.id)) {
      throw new Error(`Duplicate preview provider: ${manifest.id}`)
    }

    const root = dirname(manifestPath)
    const entry = resolve(root, pkg.main)

    if (isAbsolute(pkg.main) || relative(root, entry).startsWith('..')) {
      throw new Error('Provider entry must be inside its package')
    }

    this.providers.push({ manifest, entry })
  }

  candidates(path: string, mimeType?: string) {
    mimeType ??= mime.getType(path) ?? undefined

    const extension = extname(path).slice(1).toLowerCase()
    const preferred = this.overrides[extension]

    return this.providers
      .filter(
        (p) =>
          p.manifest.extensions.includes(extension) ||
          (mimeType && p.manifest.mimeTypes.includes(mimeType)),
      )
      .sort(
        (a, b) =>
          Number(b.manifest.id === preferred) -
            Number(a.manifest.id === preferred) ||
          a.manifest.id.localeCompare(b.manifest.id),
      )
  }

  capabilities(path: string) {
    return {
      original: this.candidates(path).some(
        (p) =>
          p.manifest.id === '@filejam/preview-images' &&
          p.manifest.capabilities.original,
      ),
    }
  }
}
