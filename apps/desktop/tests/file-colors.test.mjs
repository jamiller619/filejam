import assert from 'node:assert/strict'
import test from 'node:test'
import {
  colorForFileName,
  colorForFileValue,
} from '../dist/renderer/utils/fileColors.js'

const now = new Date('2026-10-20T12:00:00Z')
const day = 24 * 60 * 60 * 1000

test('file names retain extension-based colors', () => {
  assert.equal(colorForFileName('notes.txt'), 'blue')
  assert.equal(colorForFileName('photo.png'), 'purple')
  assert.equal(colorForFileName('LICENSE'), undefined)
})

test('dates are colored from recent to old', () => {
  assert.equal(colorForFileValue('modifiedAt', new Date(now), now), 'green')
  assert.equal(
    colorForFileValue('modifiedAt', new Date(now.getTime() - 8 * day), now),
    'purple',
  )
  assert.equal(
    colorForFileValue('modifiedAt', new Date(now.getTime() - 400 * day), now),
    'red',
  )
})

test('sizes are colored by magnitude', () => {
  assert.equal(colorForFileValue('size', 999, now), 'green')
  assert.equal(colorForFileValue('size', 1_000_000, now), 'blue')
  assert.equal(colorForFileValue('size', 100_000_000_000, now), 'red')
})

test('booleans and categorical values receive stable colors', () => {
  assert.equal(colorForFileValue('childrenDirty', true, now), 'green')
  assert.equal(colorForFileValue('childrenDirty', false, now), 'red')
  assert.equal(
    colorForFileValue('kind', 'directory', now),
    colorForFileValue('kind', 'directory', now),
  )
  assert.equal(colorForFileValue('mimeType', null, now), undefined)
})
