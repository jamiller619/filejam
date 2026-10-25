import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { PreviewRegistry } from '../dist/preview/registry.js'

test('preview metadata uses standard package fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-preview-package-'))
  const entry = join(directory, 'custom-entry.js')
  const packageJson = {
    name: '@example/custom-preview',
    version: '2.3.4',
    main: './custom-entry.js',
    filejamApp: {
      type: 'preview',
      apiVersion: 1,
      extensions: ['custom'],
      mimeTypes: ['application/x-custom'],
      capabilities: { original: false },
    },
  }

  await writeFile(join(directory, 'package.json'), JSON.stringify(packageJson))
  await writeFile(entry, 'export default {}')

  try {
    const registry = new PreviewRegistry()

    await registry.register(directory, directory)

    assert.deepEqual(registry.providers, [
      {
        manifest: {
          id: '@example/custom-preview',
          version: '2.3.4',
          apiVersion: 1,
          extensions: ['custom'],
          mimeTypes: ['application/x-custom'],
          capabilities: { original: false },
        },
        entry,
      },
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
