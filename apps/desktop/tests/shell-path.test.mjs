import assert from 'node:assert/strict'
import test from 'node:test'
import { shellPath } from '../dist/utils/shellPath.js'

test('Windows shell paths remove canonical device prefixes', () => {
  assert.equal(
    shellPath('\\\\?\\C:\\My Files\\report.pdf', 'win32'),
    'C:\\My Files\\report.pdf',
  )
  assert.equal(
    shellPath('\\\\?\\UNC\\server\\share\\report.pdf', 'win32'),
    '\\\\server\\share\\report.pdf',
  )
})

test('ordinary paths and non-Windows paths are preserved', () => {
  for (const path of [
    'C:\\file.txt',
    '\\\\server\\share\\file.txt',
    '/tmp/file.txt',
  ]) {
    assert.equal(shellPath(path, 'win32'), path)
    assert.equal(shellPath(path, 'linux'), path)
  }

  assert.equal(shellPath('\\\\?\\C:\\file.txt', 'linux'), '\\\\?\\C:\\file.txt')
})
