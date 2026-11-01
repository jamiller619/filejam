import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { createApi } from '../../../packages/server/dist/api/index.js'
import { initDatabase } from '../../../packages/server/dist/db/index.js'
import { registerApiIpc } from '../dist/api/main.js'
import { registerWindowIpc } from '../dist/ipc/window.js'

const timeout = setTimeout(() => app.exit(1), 30000)

async function run() {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-toolbar-overflow-'))
  let connection
  let window
  let unregister

  try {
    app.setPath('userData', directory)
    await app.whenReady()
    connection = await initDatabase(join(directory, 'filejam.sqlite'))

    const api = createApi(connection.db)
    const library = await api.libraries.ensureRoot(directory)

    const root = await api.entries.upsert({
      libraryId: library.id,
      name: 'root',
      relativePath: '',
      kind: 'directory',
      createdAt: new Date(),
      indexedAt: new Date(),
    })

    await api.entries.upsert({
      libraryId: library.id,
      parentId: root.id,
      name: 'Example.txt',
      relativePath: 'Example.txt',
      kind: 'file',
      createdAt: new Date(),
      indexedAt: new Date(),
    })

    await api.entries.completeScan(library.id, [])

    window = new BrowserWindow({
      width: 1100,
      height: 760,
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: true,
      webPreferences: {
        backgroundThrottling: false,
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
    ipcMain.handle('scanner:status', () => ({ state: 'idle' }))
    ipcMain.handle('preview:capabilities', () => null)

    unregister = () => {
      removeApi()
      removeWindow()
      ipcMain.removeHandler('scanner:status')
      ipcMain.removeHandler('preview:capabilities')
    }

    const js = async (code) => {
      try {
        return await window.webContents.executeJavaScript(code)
      } catch (error) {
        console.error('Failed renderer script:', code)
        throw error
      }
    }

    const waitFor = async (code) => {
      for (let i = 0; i < 100; i++) {
        if (await js(code)) {
          return
        }

        await delay(50)
      }

      throw new Error(`Timed out: ${code}`)
    }

    const click = async (expression) => {
      const point = await js(`(() => {
        const element = ${expression}
        const rect = element.getBoundingClientRect()
        const x = Math.round(rect.x + rect.width / 2)
        const y = Math.round(rect.y + rect.height / 2)
        if (!element.contains(document.elementFromPoint(x, y))) {
          return {error: 'Control obscured', x,y, element:element.outerHTML, hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,500), toolbar:testToolbar.getBoundingClientRect().toJSON()} 
        }
        return { x, y }
      })()`)
      assert.equal(point.error, undefined, JSON.stringify(point))
      window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
      window.webContents.sendInputEvent({
        type: 'mouseDown',
        button: 'left',
        clickCount: 1,
        ...point,
      })
      await delay(80)
      window.webContents.sendInputEvent({
        type: 'mouseUp',
        button: 'left',
        clickCount: 1,
        ...point,
      })
      await delay(200)
    }

    await window.loadFile(
      fileURLToPath(new URL('../dist/renderer/index.html', import.meta.url)),
    )

    await waitFor(
      `document.querySelector('button[aria-label="Show details for Example.txt"]') !== null`,
    )

    await js(`location.hash = '#/libraries/${library.id}'`)
    await waitFor(`document.body.textContent.includes('Flatten view')`)
    window.setSize(850, 760)
    await delay(500)
    await delay(500)
    await js(`
      window.testToolbar = document.querySelector('[role="toolbar"]:has(button[aria-label="More options"])')
      window.originalSort = document.querySelector('button[aria-label="Sort by"]')

    `)
    await waitFor(
      `getComputedStyle(testToolbar.querySelector('[aria-label="More options"]')).visibility === 'visible'`,
    )
    await click(`testToolbar.querySelector('[aria-label="More options"]')`)
    await waitFor(
      `document.querySelector('[role="dialog"][data-open]') !== null`,
    )
    assert.equal(
      await js(
        `document.querySelectorAll('button[aria-label="Sort by"]').length`,
      ),
      1,
    )
    assert.equal(
      await js(
        `document.querySelector('button[aria-label="Sort by"]') === originalSort`,
      ),
      true,
    )
    await waitFor(`originalSort.closest('[role="dialog"]') !== null`)
    await click(`originalSort`)
    await waitFor(`document.querySelector('[role="menu"][data-open]') !== null`)
    await js(
      `Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.startsWith('Name')).click()`,
    )
    await waitFor(`originalSort.textContent.includes('Name')`)
    assert.equal(
      await js(
        `document.querySelector('button[aria-label="Sort by"]') === originalSort`,
      ),
      true,
    )

    // Reopen the overflow if choosing a nested menu item dismissed it.
    await js(`
      if (!document.querySelector('[role="dialog"][data-open]')) {
        testToolbar.querySelector('[aria-label="More options"]').click()
      }
    `)
    await waitFor(
      `document.querySelector('[role="dialog"][data-open]') !== null`,
    )
    await click(`document.querySelector('button[aria-label="Columns"]')`)
    await waitFor(
      `document.querySelector('[role="menu"][data-open] input, [role="menu"][data-open] [role="switch"]') !== null`,
    )

    for (const width of [1800, 1100, 850, 1800]) {
      window.setSize(width, 760)
      await delay(150)
      assert.equal(
        await js(
          `document.querySelector('button[aria-label="Sort by"]') === originalSort`,
        ),
        true,
      )
      assert.equal(
        await js(
          `document.querySelectorAll('button[aria-label="Sort by"]').length`,
        ),
        1,
      )
      assert.equal(
        await js(`testToolbar.scrollWidth <= testToolbar.clientWidth + 1`),
        true,
      )
    }

    await waitFor(`originalSort.closest('[role="toolbar"]') === testToolbar`)
    const alignment = await js(`(() => {
      const items = Array.from(testToolbar.children)
      const flatten = items.find(item => item.textContent.includes('Flatten view'))
      const group = items.find(item => item.querySelector('[aria-label="Group by"]'))
      const details = items.find(item => item.querySelector('[aria-label="Hide details"], [aria-label="Show details"]'))
      return {
        separation: flatten.getBoundingClientRect().left - group.getBoundingClientRect().right,
        rightInset: testToolbar.getBoundingClientRect().right - details.getBoundingClientRect().right,
      }
    })()`)
    assert.ok(
      alignment.separation > 40,
      'Trailing controls must be pushed to the right',
    )
    assert.ok(
      Math.abs(alignment.rightInset) <= 1,
      'Details must align with the toolbar right edge',
    )
    assert.equal(
      await js(
        `getComputedStyle(testToolbar.querySelector('[aria-label="More options"]')).visibility`,
      ),
      'hidden',
    )
    console.log(
      'Toolbar overflow checks passed: single instances, nested menus, and responsive resizing.',
    )
    window.destroy()
    unregister()
    connection.close()
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    }).catch(() => {})
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
