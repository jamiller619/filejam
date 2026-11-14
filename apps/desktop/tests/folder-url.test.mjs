import assert from 'node:assert/strict'
import test from 'node:test'
import {
  folderUrl,
  isCurrentFolderUrl,
} from '../dist/renderer/utils/folderUrl.js'

test('folder URLs identify only the exact current folder', () => {
  const libraryRoot = { libraryId: 1, relativePath: '' }
  const parent = { libraryId: 1, relativePath: 'Photos' }
  const child = { libraryId: 1, relativePath: 'Photos/Trips' }

  const childLocation = new URL(folderUrl(child), 'https://files.test')

  assert.equal(isCurrentFolderUrl(childLocation, libraryRoot), false)
  assert.equal(isCurrentFolderUrl(childLocation, parent), false)
  assert.equal(isCurrentFolderUrl(childLocation, child), true)
})

test('folder URL matching distinguishes libraries and ignores other queries', () => {
  const folder = { libraryId: 1, relativePath: 'Documents' }

  assert.equal(
    isCurrentFolderUrl(
      {
        pathname: '/libraries/1',
        search: '?folder=Documents&view=grid',
      },
      folder,
    ),
    true,
  )
  assert.equal(
    isCurrentFolderUrl(
      {
        pathname: '/libraries/2',
        search: '?folder=Documents',
      },
      folder,
    ),
    false,
  )
})
