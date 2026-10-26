import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'
import { createApi } from '../../../packages/server/dist/api/index.js'
import { initDatabase } from '../../../packages/server/dist/db/index.js'
import { registerApiIpc } from '../dist/api/main.js'
import { registerWindowIpc } from '../dist/ipc/window.js'

const timeout = setTimeout(() => app.exit(1), 30000)

async function run() {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-collections-ui-'))
  let connection
  let window
  let unregister

  try {
    await app.whenReady()
    connection = await initDatabase(join(directory, 'filejam.sqlite'))

    const api = createApi(connection.db)
    const volume = await api.volumes.ensure(directory)

    const root = await api.entries.upsert({
      volumeId: volume.id,
      name: 'root',
      relativePath: '',
      kind: 'directory',
      indexedAt: new Date(),
    })

    const file = await api.entries.upsert({
      volumeId: volume.id,
      parentId: root.id,
      name: 'Example.txt',
      relativePath: 'Example.txt',
      kind: 'file',
      indexedAt: new Date(),
    })

    await api.entries.completeScan(volume.id, [])

    window = new BrowserWindow({
      width: 1100,
      height: 760,
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

    const settings = new Map([
      ['user.favoriteFolders', []],
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

    const js = (code) => window.webContents.executeJavaScript(code)

    const waitFor = async (code) => {
      for (let i = 0; i < 100; i++) {
        if (await js(code)) {
          return
        }

        await delay(50)
      }

      throw new Error(`Timed out: ${code}`)
    }

    await window.loadFile(
      fileURLToPath(new URL('../dist/renderer/index.html', import.meta.url)),
    )

    await waitFor(
      `document.querySelector('button[aria-label="Show details for Example.txt"]') !== null`,
    )

    await waitFor(
      `document.querySelector('aside[aria-label^="Folder details:"]') !== null`,
    )

    const spacing = await js(
      `(() => { const table = document.querySelector('table'); const box = table.parentElement; return { padding: parseFloat(getComputedStyle(box).paddingLeft), rowPadding: parseFloat(getComputedStyle(document.querySelector('td')).paddingTop) } })()`,
    )

    assert.ok(spacing.padding > 0)
    assert.ok(spacing.rowPadding <= 4)

    await js(
      `document.querySelector('button[aria-label="Show details for Example.txt"]').click()`,
    )

    await waitFor(
      `document.querySelector('aside fieldset:not([disabled])') !== null`,
    )

    await delay(200)

    assert.deepEqual(
      (await api.collections.listEntries('recents')).entries.map(
        (entry) => entry.id,
      ),
      [file.id],
    )

    const stable = await js(
      `new Promise(resolve => { const panel = document.querySelector('aside'); let changes = 0; const observer = new MutationObserver(() => changes++); observer.observe(panel, { attributes: true }); setTimeout(() => { observer.disconnect(); resolve({ connected: panel.isConnected, changes, overflow: getComputedStyle(panel).overflowY }) }, 600) })`,
    )

    assert.equal(stable.connected, true)
    assert.equal(stable.changes, 0)
    assert.equal(stable.overflow, 'auto')

    await js(
      `document.querySelector('main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`,
    )

    await delay(200)
    assert.equal(await js(`document.querySelector('aside') !== null`), true)

    await js(
      `Array.from(document.querySelectorAll('aside label')).find(el => el.textContent.trim() === 'Favorite').querySelector('input').click()`,
    )

    await waitFor(
      `Array.from(document.querySelectorAll('aside label')).find(el => el.textContent.trim() === 'Favorite').querySelector('input').checked`,
    )

    assert.equal(
      (await api.collections.listEntries('favorites')).entries.length,
      1,
    )

    await js(
      `document.querySelector('button[aria-label="Hide file details"]').click(); document.querySelector('a[href="#/collections/favorites"]').click()`,
    )

    await waitFor(
      `document.querySelector('h2')?.textContent === 'Favorites' && document.querySelector('button[aria-label="Show details for Example.txt"]') !== null`,
    )

    await js(
      `document.querySelector('button[aria-label="Show details for Example.txt"]').click()`,
    )

    await waitFor(
      `document.querySelector('aside fieldset:not([disabled])') !== null`,
    )

    await js(
      `Array.from(document.querySelectorAll('aside label')).find(el => el.textContent.trim() === 'Favorite').querySelector('input').click()`,
    )

    await waitFor(
      `document.querySelector('main')?.textContent.includes('No files to display.')`,
    )

    assert.equal(
      (await api.collections.listEntries('favorites')).entries.length,
      0,
    )

    await js(
      `document.querySelector('a[href="#/collections/recents"]').click()`,
    )

    await waitFor(
      `document.querySelector('h2')?.textContent === 'Recents' && document.querySelector('button[aria-label="Show details for Example.txt"]') !== null`,
    )

    await js(
      `document.querySelector('button[aria-label="Show details for Example.txt"]').click()`,
    )

    await waitFor(
      `document.querySelector('aside fieldset:not([disabled])') !== null`,
    )

    await delay(200)

    await js(`document.querySelector('a[href="#/settings"]').click()`)
    await waitFor(
      `Array.from(document.querySelectorAll('button')).some(el => el.textContent.trim() === 'New collection')`,
    )
    await js(
      `Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'New collection').click()`,
    )
    await waitFor(
      `document.querySelector('input[aria-label="Collection name"]')`,
    )
    await js(
      `(() => { const input = document.querySelector('input[aria-label="Collection name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Project'); input.dispatchEvent(new Event('input', { bubbles: true })); Array.from(document.querySelectorAll('aside button')).find(el => el.textContent.trim() === 'Add rule').click() })()`,
    )
    await waitFor(`document.querySelector('input[aria-label="Rule value"]')`)
    await js(
      `(() => { const input = document.querySelector('input[aria-label="Rule value"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Example'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    )
    await js(
      `Array.from(document.querySelectorAll('aside button')).find(el => el.textContent.trim() === 'Create').click()`,
    )

    await waitFor(
      `Array.from(document.querySelectorAll('nav a')).some(el => el.textContent.trim() === 'Project')`,
    )

    const project = (await api.collections.list()).find(
      (item) => item.name === 'Project',
    )

    assert.ok(project)

    assert.equal(
      (await api.collections.listEntries(project.id)).entries.length,
      1,
    )

    window.show()
    await delay(300)

    await writeFile(
      join(directory, 'collections.png'),
      (await window.webContents.capturePage()).toPNG(),
    )

    console.log(
      'Collections UI checks passed; screenshot:',
      join(directory, 'collections.png'),
    )

    window.destroy()
    unregister()
    connection.close()

    // Retain the screenshot for visual inspection; database is isolated in temp.
    await rm(join(directory, 'filejam.sqlite'), {
      force: true,
      recursive: true,
      maxRetries: 10,
      retryDelay: 100,
    }).catch((error) => {
      if (error.code !== 'EBUSY') {
        throw error
      }

      console.warn(
        'Windows retained the temporary test database until process exit.',
      )
    })

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
