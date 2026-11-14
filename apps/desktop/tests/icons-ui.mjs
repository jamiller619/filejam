import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import sharp from 'sharp'
import { createApi } from '../../../packages/server/dist/api/index.js'
import { initDatabase } from '../../../packages/server/dist/db/index.js'
import { registerApiIpc } from '../dist/api/main.js'
import { createIconHandler } from '../dist/icons/assets.js'
import { registerWindowIpc } from '../dist/ipc/window.js'

protocol.registerSchemesAsPrivileged([
  { scheme: 'filejam-icon', privileges: { standard: true, secure: true } },
])

const timeout = setTimeout(() => app.exit(1), 45000)

async function run() {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-icons-ui-'))
  let connection
  let window
  let unregister

  try {
    app.setPath('userData', directory)
    await app.whenReady()
    connection = await initDatabase(join(directory, 'test.sqlite'))

    const api = createApi(connection.db)
    const library = await api.libraries.ensureRoot(directory)
    const base = {
      libraryId: library.id,
      createdAt: new Date(),
      indexedAt: new Date(),
    }
    const root = await api.entries.upsert({
      ...base,
      name: 'Projects',
      relativePath: '',
      kind: 'directory',
    })
    const file = await api.entries.upsert({
      ...base,
      parentId: root.id,
      name: 'Example.txt',
      relativePath: 'Example.txt',
      kind: 'file',
    })
    const folder = await api.entries.upsert({
      ...base,
      parentId: root.id,
      name: 'Design',
      relativePath: 'Design',
      kind: 'directory',
    })

    await api.entries.completeScan(library.id, [])

    window = new BrowserWindow({
      width: 1100,
      height: 760,
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: true,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        preload: fileURLToPath(
          new URL('../dist/scanner/preload.cjs', import.meta.url),
        ),
        sandbox: true,
        contextIsolation: true,
      },
    })
    const settings = new Map([
      ['user.favoriteFolders', [join(directory, 'Design')]],
      ['user.dateformat', 'relative'],
      ['user.files.showExtensions', false],
      ['user.files.colorCoding', true],
    ])
    const removeApi = registerApiIpc(api, window.webContents, {
      get: async (key) => settings.get(key),
      set: async (key, value) => settings.set(key, value),
    })
    const removeWindow = registerWindowIpc(window)

    unregister = () => {
      removeApi()
      removeWindow()
    }
    ipcMain.handle('scanner:status', () => ({ state: 'idle' }))
    ipcMain.handle('preview:capabilities', () => ({ original: false }))
    protocol.handle('filejam-icon', createIconHandler(join(directory, 'icons')))

    const js = (code) => window.webContents.executeJavaScript(code)
    const waitFor = async (code) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await js(code)) {
          return
        }

        await delay(50)
      }

      throw new Error(`Timed out: ${code}`)
    }
    const clickText = (text) =>
      js(
        `Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`,
      )
    const openRow = async (id) => {
      await js(
        `document.querySelector('[data-file-id="${id}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`,
      )
      await waitFor(`document.querySelector('dialog[open]') !== null`)
    }

    await window.loadFile(
      fileURLToPath(new URL('../dist/renderer/index.html', import.meta.url)),
    )
    await waitFor(
      `document.querySelector('[data-file-id="${file.id}"]') !== null`,
    )
    await openRow(file.id)
    assert.equal(
      await js(
        `document.querySelector('dialog').contains(document.activeElement)`,
      ),
      true,
    )
    await js(
      `document.querySelector('dialog button[aria-label="rocket"]').click()`,
    )
    await js(
      `document.querySelector('dialog button[aria-label="blue color"]').click()`,
    )
    await delay(300)
    await writeFile(
      join(directory, 'picker.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    await clickText('Apply')
    await waitFor(`document.querySelector('dialog') === null`)

    assert.equal(
      (await api.appearance.list()).find(
        (row) => row.target.relativePath === 'Example.txt',
      ).icon.name,
      'lucide:rocket',
    )
    await window.reload()
    await waitFor(
      `document.querySelector('[data-file-id="${file.id}"] [data-color="blue"] svg') !== null`,
    )

    // Folder customization must appear in the favorite link immediately.
    await openRow(folder.id)
    await js(
      `document.querySelector('dialog button[aria-label="palette"]').click()`,
    )
    await clickText('Apply')
    await waitFor(`document.querySelector('dialog') === null`)
    assert.equal(
      await js(
        `document.querySelector('ol[aria-label="Favorite folders"] [data-color] svg') !== null`,
      ),
      true,
    )

    // Select a real file through the trusted import handler, with the dialog stubbed.
    const uploadPath = join(directory, 'upload.png')

    await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#a855f7' },
    })
      .png()
      .toFile(uploadPath)
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [uploadPath],
    })
    await openRow(file.id)
    await clickText('Upload')
    await clickText('Choose image…')
    await waitFor(`document.querySelector('dialog img')?.naturalWidth === 256`)
    await clickText('Apply')
    await waitFor(`document.querySelector('dialog') === null`)
    await waitFor(
      `document.querySelector('[data-file-id="${file.id}"] img[src^="filejam-icon:"]')?.naturalWidth === 256`,
    )

    // The same picker is available on collection pages and reset restores defaults.
    await js(`location.hash = '/collections/favorites'`)
    await waitFor(
      `document.querySelector('button[aria-label="Change icon for collection"]') !== null`,
    )
    await js(
      `document.querySelector('button[aria-label="Change icon for collection"]').click()`,
    )
    await waitFor(`document.querySelector('dialog[open]') !== null`)
    await js(
      `document.querySelector('dialog button[aria-label="heart"]').click()`,
    )
    await clickText('Apply')
    await waitFor(`document.querySelector('dialog') === null`)
    assert.equal(
      (await api.appearance.list()).find(
        (row) => row.target.kind === 'collection',
      ).icon.name,
      'lucide:heart',
    )
    await js(
      `document.querySelector('button[aria-label="Change icon for collection"]').click()`,
    )
    await waitFor(`document.querySelector('dialog[open]') !== null`)
    await clickText('Reset to default')
    await waitFor(`document.querySelector('dialog') === null`)
    assert.equal(
      (await api.appearance.list()).some(
        (row) => row.target.kind === 'collection',
      ),
      false,
    )

    console.log(
      'Icon UI passed: selection, color, restart, favorite inheritance, upload, collection, reset. Screenshot:',
      join(directory, 'picker.png'),
    )
    window.destroy()
    unregister()
    connection.close()
    clearTimeout(timeout)
    app.quit()
  } catch (error) {
    console.error(error)
    window?.destroy()
    unregister?.()
    connection?.close()
    clearTimeout(timeout)
    app.exit(1)
  }
}

void run()
