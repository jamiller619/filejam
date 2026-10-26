import assert from 'node:assert/strict'
import test from 'node:test'
import {
  folderUrl,
  isCurrentFolderUrl,
} from '../dist/renderer/utils/folderUrl.js'

test('folder URLs identify only the exact current folder', () => {
  const volumeRoot = { volumeId: 1, relativePath: '' }
  const parent = { volumeId: 1, relativePath: 'Photos' }
  const child = { volumeId: 1, relativePath: 'Photos/Trips' }

  const childLocation = new URL(folderUrl(child), 'https://files.test')

  assert.equal(isCurrentFolderUrl(childLocation, volumeRoot), false)
  assert.equal(isCurrentFolderUrl(childLocation, parent), false)
  assert.equal(isCurrentFolderUrl(childLocation, child), true)
})

test('folder URL matching distinguishes volumes and ignores other queries', () => {
  const folder = { volumeId: 1, relativePath: 'Documents' }

  assert.equal(
    isCurrentFolderUrl(
      {
        pathname: '/browse/1',
        search: '?path=Documents&view=grid',
      },
      folder,
    ),
    true,
  )
  assert.equal(
    isCurrentFolderUrl(
      {
        pathname: '/browse/2',
        search: '?path=Documents',
      },
      folder,
    ),
    false,
  )
})
