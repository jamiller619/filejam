import assert from 'node:assert/strict'
import { win32 } from 'node:path'
import test from 'node:test'
import { resolveDefaultFolder } from '../dist/defaultFolders.js'

test('resolves the shared Applications location on each desktop OS', () => {
  const unusedElectronPath = () => assert.fail('Should not use Electron paths')

  assert.equal(
    resolveDefaultFolder('applications', unusedElectronPath, 'darwin'),
    '/Applications',
  )
  assert.equal(
    resolveDefaultFolder('applications', unusedElectronPath, 'linux'),
    '/usr/share/applications',
  )
  assert.equal(
    resolveDefaultFolder('applications', unusedElectronPath, 'win32', {
      ProgramData: 'C:\\ProgramData',
    }),
    win32.join(
      'C:\\ProgramData',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
    ),
  )
})

test('continues to delegate Electron known folders', () => {
  assert.equal(
    resolveDefaultFolder('documents', (folder) => `native:${folder}`, 'linux'),
    'native:documents',
  )
})

test('rejects an unavailable or unsupported Applications location', () => {
  const unusedElectronPath = () => assert.fail('Should not use Electron paths')

  assert.throws(
    () => resolveDefaultFolder('applications', unusedElectronPath, 'win32', {}),
    /ProgramData is unavailable/,
  )
  assert.throws(
    () => resolveDefaultFolder('applications', unusedElectronPath, 'freebsd'),
    /Unsupported application platform/,
  )
})
