import assert from 'node:assert/strict'
import test from 'node:test'
import { createFileIconProvider } from '../dist/preview/file-icons.js'

test('caches file type icons by extension and requested display size', async () => {
  const loads = []
  const provider = createFileIconProvider(async (file, size) => {
    loads.push({ file, size })

    return new TextEncoder().encode(`${file}:${size}`)
  })

  const first = await provider('/volume/first.pdf', 'list')
  const second = await provider('/volume/second.PDF', 'list')
  const grid = await provider('/volume/third.pdf', 'grid')

  assert.equal(new TextDecoder().decode(first), '/volume/first.pdf:normal')
  assert.equal(second, first)
  assert.equal(new TextDecoder().decode(grid), '/volume/third.pdf:large')
  assert.deepEqual(loads, [
    { file: '/volume/first.pdf', size: 'normal' },
    { file: '/volume/third.pdf', size: 'large' },
  ])
})

test('preserves embedded application icons and handles native failures', async () => {
  const loads = []
  const provider = createFileIconProvider(async (file) => {
    loads.push(file)

    if (file.endsWith('.bad')) {
      throw new Error('Native icon unavailable')
    }

    return new Uint8Array([1])
  })

  await provider('/apps/first.exe', 'grid')
  await provider('/apps/second.exe', 'grid')

  assert.equal(await provider('/files/first.bad', 'list'), null)
  assert.equal(await provider('/files/second.bad', 'list'), null)
  assert.deepEqual(loads, [
    '/apps/first.exe',
    '/apps/second.exe',
    '/files/first.bad',
  ])
})
