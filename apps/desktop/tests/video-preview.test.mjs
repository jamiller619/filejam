import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { createPreviewHandler } from '../dist/preview/handler.js'

test('preview protocol streams authorized videos with range requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-video-preview-'))
  const rootPath = join(directory, 'library')

  await mkdir(rootPath)
  await writeFile(join(rootPath, 'clip.mp4'), 'video')
  await writeFile(join(rootPath, 'notes.txt'), 'notes')

  const fetched = []
  const handler = createPreviewHandler(
    { list: async () => [{ id: 1, name: 'Videos', rootPath }] },
    async (url, init) => {
      fetched.push({ url, init })

      return new Response('video', {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': '3',
          'Content-Range': 'bytes 0-2/5',
        },
      })
    },
  )

  try {
    const params = new URLSearchParams({ libraryId: '1', path: 'clip.mp4' })
    const response = await handler(
      new Request(`files-preview://video?${params}`, {
        headers: { Range: 'bytes=0-2' },
      }),
    )

    assert.equal(response.status, 206)
    assert.equal(response.headers.get('content-type'), 'video/mp4')
    assert.equal(response.headers.get('content-range'), 'bytes 0-2/5')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), 'video')
    assert.deepEqual(fetched, [
      {
        url: pathToFileURL(join(rootPath, 'clip.mp4')).href,
        init: { headers: { Range: 'bytes=0-2' } },
      },
    ])

    const textParams = new URLSearchParams({
      libraryId: '1',
      path: 'notes.txt',
    })

    assert.equal(
      (await handler(new Request(`files-preview://video?${textParams}`)))
        .status,
      415,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
