import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { createPreviewHandler } from '../dist/preview/handler.js'

test('preview serves indexed images and rejects invalid or escaped sources', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-preview-'))
  const rootPath = join(directory, 'library')
  await mkdir(rootPath)
  await writeFile(join(rootPath, 'photo #1.PNG'), 'image')
  await writeFile(join(directory, 'outside.png'), 'outside')
  const sources = {
    1: { rootPath, relativePath: 'photo #1.PNG' },
    2: { rootPath, relativePath: '../outside.png' },
    3: { rootPath, relativePath: 'notes.txt' },
    4: { rootPath, relativePath: 'missing.png' },
    5: { rootPath, relativePath: directory },
  }
  const fetched = []
  const handler = createPreviewHandler(
    { getFileSource: async (id) => sources[id] ?? null },
    async (url) => {
      fetched.push(url)
      return new Response('image')
    },
  )
  const request = (path) => handler(new Request(`files-preview://file/${path}`))
  try {
    const response = await request('1?v=changed')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(await response.text(), 'image')
    assert.deepEqual(fetched, [
      pathToFileURL(join(rootPath, 'photo #1.PNG')).href,
    ])
    assert.equal((await request('2')).status, 403)
    assert.equal((await request('3')).status, 415)
    assert.equal((await request('4')).status, 404)
    assert.equal((await request('99')).status, 404)
    assert.equal((await request('invalid')).status, 400)
    assert.equal(
      (await handler(new Request('files-preview://other/1'))).status,
      400,
    )
    assert.equal(
      (await handler(new Request('files-preview://file/1', { method: 'POST' })))
        .status,
      405,
    )
    assert.equal(fetched.length, 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
