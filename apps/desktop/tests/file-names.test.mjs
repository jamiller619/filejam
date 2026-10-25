import assert from 'node:assert/strict'
import test from 'node:test'
import { fileNameForDisplay } from '../dist/renderer/utils/fileNames.js'

test('file extensions are hidden by default', () => {
  assert.equal(fileNameForDisplay('photo.png', false), 'photo')
  assert.equal(fileNameForDisplay('archive.tar.gz', false), 'archive.tar')
})

test('extensionless and hidden files retain their full names', () => {
  assert.equal(fileNameForDisplay('LICENSE', false), 'LICENSE')
  assert.equal(fileNameForDisplay('.gitignore', false), '.gitignore')
})

test('file extensions can be shown', () => {
  assert.equal(fileNameForDisplay('photo.png', true), 'photo.png')
})
