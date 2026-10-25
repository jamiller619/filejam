import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applicationsManifest,
  createApplicationsProvider,
} from '../dist/entries/applications.js'
import { EntryRegistry } from '../dist/entries/registry.js'

test('Applications locks its Windows root to a flat view', () => {
  const registry = new EntryRegistry('win32')

  registry.register(
    applicationsManifest,
    createApplicationsProvider(() => ({ target: '' })),
  )

  assert.deepEqual(registry.folderView('applications'), {
    recursive: true,
    showDirectories: false,
    allowFlattenToggle: false,
  })
  assert.equal(registry.folderView('documents'), null)
})

test('Windows shortcuts use their target name, details, and native icon', async () => {
  const registry = new EntryRegistry('win32')

  registry.register(
    applicationsManifest,
    createApplicationsProvider((path) => {
      assert.equal(path, 'C:\\Start Menu\\Tools\\Editor.lnk')

      return {
        target: 'C:\\Program Files\\Editor\\editor.exe',
        args: '--new-window',
        cwd: 'C:\\Program Files\\Editor',
      }
    }),
  )

  assert.deepEqual(
    await registry.resolve({
      path: 'C:\\Start Menu\\Tools\\Editor.lnk',
      name: 'Editor.lnk',
      kind: 'file',
    }),
    {
      typeId: '@filejam/applications/windows-shortcut',
      displayName: 'Editor',
      icon: {
        type: 'native',
        path: 'C:\\Program Files\\Editor\\editor.exe',
      },
      activation: {
        type: 'open-path',
        path: 'C:\\Start Menu\\Tools\\Editor.lnk',
      },
      details: {
        Target: 'C:\\Program Files\\Editor\\editor.exe',
        Arguments: '--new-window',
        'Working directory': 'C:\\Program Files\\Editor',
      },
    },
  )
})

test('entry contributions are platform-specific and broken shortcuts degrade', async () => {
  const linux = new EntryRegistry('linux')
  const windows = new EntryRegistry('win32')
  const provider = createApplicationsProvider(() => {
    throw new Error('Broken shortcut')
  })

  linux.register(applicationsManifest, provider)
  windows.register(applicationsManifest, provider)

  const request = {
    path: 'C:\\Start Menu\\Missing.lnk',
    name: 'Missing.lnk',
    kind: 'file',
  }

  assert.equal(linux.folderView('applications'), null)
  assert.equal(await linux.resolve(request), null)
  assert.deepEqual(await windows.resolve(request), {
    typeId: '@filejam/applications/windows-shortcut',
    displayName: 'Missing',
    activation: {
      type: 'open-path',
      path: 'C:\\Start Menu\\Missing.lnk',
    },
  })
})
