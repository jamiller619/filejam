import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import {
  createIconHandler,
  maximumIconBytes,
  normalizeIcon,
  storeIcon,
} from '../dist/icons/assets.js'

test('uploads normalize to PNG, deduplicate, and load only through opaque asset IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-icons-'))

  try {
    const source = await sharp({
      create: { width: 600, height: 300, channels: 4, background: '#ff000080' },
    })
      .webp()
      .toBuffer()
    const first = await storeIcon(directory, source)
    const second = await storeIcon(directory, source)

    assert.equal(first, second)

    const handler = createIconHandler(directory)
    const response = await handler(new Request(`filejam-icon://asset/${first}`))
    const metadata = await sharp(
      Buffer.from(await response.arrayBuffer()),
    ).metadata()

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(metadata.width, 256)
    assert.equal(metadata.height, 256)
    assert.equal(metadata.hasAlpha, true)
    assert.equal(
      (await handler(new Request('filejam-icon://asset/../../config.json')))
        .status,
      404,
    )
    assert.equal(
      (await handler(new Request(`filejam-icon://other/${first}`))).status,
      404,
    )
    assert.equal(
      (await handler(new Request(`filejam-icon://asset/${'0'.repeat(64)}`)))
        .status,
      404,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('uploads reject active formats, malformed images, oversized input, and excessive pixels', async () => {
  await assert.rejects(
    normalizeIcon(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
      ),
    ),
    /still PNG/,
  )
  await assert.rejects(normalizeIcon(Buffer.from('not an image')))
  await assert.rejects(
    normalizeIcon(Buffer.alloc(maximumIconBytes + 1)),
    /2 MB/,
  )

  const huge = await sharp({
    create: { width: 4097, height: 4097, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer()

  await assert.rejects(normalizeIcon(huge), /pixel limit/)
})
