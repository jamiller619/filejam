import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { createApi } from '../../../packages/server/dist/api/index.js'
import { initConfig } from '../../../packages/server/dist/config/index.js'
import { initDatabase } from '../../../packages/server/dist/db/index.js'
import { registerApiIpc } from '../dist/api/main.js'
import { registerWindowIpc } from '../dist/ipc/window.js'

async function run() {
  await app.whenReady()

  const directory = await mkdtemp(join(tmpdir(), 'filejam-search-focus-'))
  process.env.FILEJAM_CONFIG_FILE = join(directory, 'config.json')
  const connection = await initDatabase(join(directory, 'test.sqlite'))
  const api = createApi(connection.db, await initConfig())
  const library = await api.libraries.ensureRoot(app.getPath('temp'))

  await api.entries.upsert({
    libraryId: library.id,
    name: 'root',
    relativePath: '',
    kind: 'directory',
    createdAt: new Date(),
    modifiedAt: new Date(),
    indexedAt: new Date(),
  })
  await api.entries.completeScan(library.id, [])

  const window = new BrowserWindow({
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      preload: fileURLToPath(
        new URL('../dist/scanner/preload.cjs', import.meta.url),
      ),
      sandbox: true,
      contextIsolation: true,
    },
  })
  const removeApi = registerApiIpc(api, window.webContents)
  const removeWindow = registerWindowIpc(window)
  ipcMain.handle('preview:capabilities', () => [])
  const js = (code) => window.webContents.executeJavaScript(code)

  try {
    await window.loadFile(
      fileURLToPath(new URL('../dist/renderer/index.html', import.meta.url)),
    )

    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await js(
          `document.querySelector('button[aria-label="Hide details"]') !== null`,
        )
      ) {
        break
      }

      await delay(50)
    }

    await js(
      `window.searchInput = document.querySelector('input[aria-label="Search open folders"]'); window.searchInput.focus()`,
    )

    for (const character of 'example') {
      await window.webContents.insertText(character)
      await delay(400)

      const state = await js(`({
      sameInput: window.searchInput === document.querySelector('input[aria-label="Search open folders"]'),
      focused: document.activeElement === window.searchInput,
      activeLabel: document.activeElement?.getAttribute('aria-label'),
      value: window.searchInput.value,
    })`)

      assert.equal(state.sameInput, true, JSON.stringify(state))
      assert.equal(state.focused, true, JSON.stringify(state))
    }

    assert.equal(await js('window.searchInput.value'), 'example')
    console.log(
      'Search keeps the same focused input across typing and result updates',
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    window.destroy()
    removeApi()
    removeWindow()
    connection.close()
    app.exit(process.exitCode ?? 0)
  }
}

void run().catch((error) => {
  console.error(error)
  app.exit(1)
})
