import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { createPreviewHandler } from '../dist/preview/handler.js'

test('preview protocol routes images, folders, library artwork and fallback icons', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-preview-'))
  const rootPath = join(directory, 'library')

  await mkdir(rootPath)
  await mkdir(join(rootPath, 'folder'))
  await mkdir(join(directory, 'outside'))

  await symlink(
    join(directory, 'outside'),
    join(rootPath, 'escape'),
    'junction',
  )

  await writeFile(join(rootPath, 'photo #1 & café.PNG'), 'image')
  await writeFile(join(rootPath, 'notes.txt'), 'notes')
  await writeFile(join(directory, 'outside', 'private.png'), 'private')

  const fetched = []
  const nativeIconRequests = []
  let failFetch = false
  let nativeIconsAvailable = true

  const handler = createPreviewHandler(
    { list: async () => [{ id: 1, name: 'Downloads', rootPath }] },
    async (url) => {
      fetched.push(url)

      if (failFetch) {
        throw new Error('Unreadable file')
      }

      return new Response('image')
    },
    undefined,
    async (file, variant) => {
      nativeIconRequests.push({ file, variant })

      return nativeIconsAvailable
        ? new TextEncoder().encode(`native:${file}:${variant}`)
        : null
    },
  )

  const request = (path, extra = {}) =>
    handler(
      new Request(
        'filejam-preview://preview-image?' +
          new URLSearchParams({
            libraryId: '1',
            path,
            ...extra,
          }),
      ),
    )

  try {
    const response = await request('photo #1 & café.PNG', { v: 'changed' })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(
      response.headers.get('cache-control'),
      'private, max-age=31536000, immutable',
    )
    assert.equal(await response.text(), 'image')

    assert.deepEqual(fetched, [
      pathToFileURL(join(rootPath, 'photo #1 & café.PNG')).href,
    ])

    const filePreview = await request('notes.txt')

    assert.equal(filePreview.status, 415)

    const fileIcon = await request('notes.txt', { fallback: '1' })

    assert.equal(fileIcon.status, 200)
    assert.equal(fileIcon.headers.get('content-type'), 'image/png')
    assert.equal(fileIcon.headers.get('cache-control'), 'no-store')
    assert.match(await fileIcon.text(), /native:.*notes\.txt:list/)

    for (const path of ['folder', '']) {
      const icon = await request(path)

      assert.equal(icon.status, 200)
      assert.equal(icon.headers.get('content-type'), 'image/svg+xml')
      assert.equal(icon.headers.get('cache-control'), 'no-store')
      assert.match(await icon.text(), /<svg/)
    }

    for (const path of ['notes.txt', 'folder', '']) {
      assert.equal((await request(path, { original: '1' })).status, 415)
    }

    const original = await request('photo #1 & caf\u00e9.PNG', {
      original: '1',
      v: 'changed',
    })

    assert.equal(original.status, 200)
    assert.equal(original.headers.get('cache-control'), 'no-store')

    const folder = await request('folder', {
      variant: 'grid',
      color: '#ff8800',
    })

    const artwork = await folder.text()

    assert.match(artwork, /linearGradient/)

    const library = await request('', { variant: 'grid' })

    assert.match(await library.text(), /x="77"/)
    assert.doesNotMatch(artwork, /x="77"/)

    const fallback = await request('photo #1 & café.PNG', { fallback: '1' })

    assert.equal(fallback.headers.get('content-type'), 'image/png')
    assert.match(await fallback.text(), /native:.*photo #1 & café\.PNG:list/)
    assert.equal(fetched.length, 2)
    failFetch = true
    assert.equal(
      (await request('photo #1 & caf\u00e9.PNG', { original: '1' })).status,
      415,
    )

    const failedPreview = await request('photo #1 & café.PNG')

    assert.equal(failedPreview.status, 415)

    const failedPreviewIcon = await request('photo #1 & café.PNG', {
      fallback: '1',
    })

    assert.equal(failedPreviewIcon.headers.get('content-type'), 'image/png')

    nativeIconsAvailable = false

    const genericFallback = await request('notes.txt', { fallback: '1' })

    assert.equal(genericFallback.headers.get('content-type'), 'image/svg+xml')
    assert.match(await genericFallback.text(), /<svg/)

    const authorizedNativeRequests = nativeIconRequests.length

    assert.equal((await request('../outside/private.png')).status, 403)
    assert.equal((await request('escape/private.png')).status, 403)
    assert.equal((await request(rootPath)).status, 403)
    assert.equal((await request('missing.png')).status, 404)
    assert.equal((await request('', { libraryId: '99' })).status, 404)
    assert.equal((await request('', { libraryId: 'invalid' })).status, 400)
    assert.equal((await request('', { color: 'red;"><script>' })).status, 400)

    assert.equal(nativeIconRequests.length, authorizedNativeRequests)

    assert.equal(
      (
        await handler(
          new Request('filejam-preview://preview-image?libraryId=1'),
        )
      ).status,
      400,
    )

    assert.equal(
      (await handler(new Request('filejam-preview://other/1'))).status,
      400,
    )

    assert.equal(
      (
        await handler(
          new Request('filejam-preview://preview-image', { method: 'POST' }),
        )
      ).status,
      405,
    )

    assert.equal(fetched.length, 4)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('entry providers can redirect native icon lookup to a resolved target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-entry-icon-'))
  const rootPath = join(directory, 'Applications')
  const shortcut = join(rootPath, 'Editor.lnk')
  const target = 'C:\\Program Files\\Editor\\editor.exe'

  await mkdir(rootPath)
  await writeFile(shortcut, 'shortcut')

  const iconRequests = []
  const handler = createPreviewHandler(
    { list: async () => [{ id: 1, name: 'Applications', rootPath }] },
    async () => new Response(null, { status: 415 }),
    undefined,
    async (path) => {
      iconRequests.push(path)

      return new Uint8Array([1])
    },
    {
      resolve: async () => ({
        typeId: '@example/application',
        icon: { type: 'native', path: target },
      }),
    },
  )

  try {
    const response = await handler(
      new Request(
        'filejam-preview://preview-image?libraryId=1&path=Editor.lnk&fallback=1',
      ),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(iconRequests, [target])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
