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
    const secondFile = await api.entries.upsert({
      ...base,
      parentId: root.id,
      name: 'Second.txt',
      relativePath: 'Second.txt',
      kind: 'file',
    })

    await api.entries.completeScan(library.id, [])
    const collection = await api.collections.create({
      name: 'Context menu fixtures',
      definition: {
        version: 1,
        match: 'all',
        rules: [{ field: 'name', operator: 'notEquals', value: 'Projects' }],
        sort: [{ field: 'name', direction: 'asc' }],
        limit: null,
      },
    })

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
    ipcMain.handle('filesystem:list', () => ({ entries: [], scanned: true }))
    ipcMain.handle('browser:locations', () => ({
      home: directory,
      places: [{ name: 'Design', path: join(directory, 'Design') }],
      drives: [
        {
          name: 'Favorite drive',
          path:
            process.platform === 'win32'
              ? `${join(directory, 'Design').toUpperCase().replaceAll('\\', '/')}/`
              : `${join(directory, 'Design')}/`,
        },
      ],
      favorites: [],
    }))
    protocol.handle('filejam-icon', createIconHandler(join(directory, 'icons')))

    const js = async (code) => {
      try {
        return await window.webContents.executeJavaScript(code)
      } catch (cause) {
        throw new Error(`Renderer script failed: ${code}`, { cause })
      }
    }
    const waitFor = async (code) => {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (await js(code)) {
          return
        }

        await delay(50)
      }

      throw new Error(
        `Timed out: ${code}\n${await js('document.body.innerText')}`,
      )
    }
    const clickText = (text) =>
      js(
        `Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`,
      )
    const openMenu = async (id) => {
      await js(
        `document.querySelector('[data-file-id="${id}"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`,
      )
      await waitFor(`document.querySelector('[role="menu"]') !== null`)
    }
    const dismissMenu = async () => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await waitFor(`document.querySelector('[role="menu"]') === null`)
    }
    const clickRow = (id, modifiers = {}) =>
      js(`(() => {
      const row = document.querySelector('[data-file-id="${id}"]')
      const action = row.querySelector('button, a') ?? row
      action.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, detail: 1, ...${JSON.stringify(modifiers)},
      }))
    })()`)
    const assertSelection = async (ids) => {
      assert.deepEqual(
        await js(
          `Array.from(document.querySelectorAll('[data-file-id][data-selected="true"]'), row => Number(row.dataset.fileId)).sort((a, b) => a - b)`,
        ),
        ids.toSorted((a, b) => a - b),
      )
    }
    const openRow = async (id) => {
      await openMenu(id)
      assert.equal(
        await js(
          `document.querySelector('[data-file-id="${id}"]').dataset.selected`,
        ),
        'true',
      )
      await js(
        `Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent === 'Change icon…').click()`,
      )
      await waitFor(`document.querySelector('dialog[open]') !== null`)
    }

    await window.loadFile(
      fileURLToPath(new URL('../dist/renderer/index.html', import.meta.url)),
      { hash: `/collections/${collection.id}` },
    )
    await waitFor(
      `document.querySelector('[data-file-id="${file.id}"]') !== null`,
    )
    await waitFor(
      `document.querySelector('nav[aria-label="Main navigation"] ol[aria-label="Favorite folders"] a') !== null`,
    )
    assert.equal(
      await js(
        `Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] a')).filter(link => link.title === ${JSON.stringify(join(directory, 'Design'))}).length`,
      ),
      1,
    )
    assert.equal(
      await js(
        `document.querySelector('nav[aria-label="Main navigation"]').textContent.includes('Favorite drive')`,
      ),
      false,
    )
    await openMenu(file.id)
    await delay(100)
    assert.equal(
      await js(`(() => {
        const row = document.querySelector('[data-file-id="${file.id}"]')
        return getComputedStyle(row.querySelector('iconify-icon')).color === getComputedStyle(row).color
      })()`),
      true,
      'Default file icons inherit the selected row color',
    )
    await writeFile(
      join(directory, 'context-menu.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
    assert.equal(
      await js(
        `document.querySelector('[data-file-id="${file.id}"]').dataset.selected`,
      ),
      'true',
    )
    await dismissMenu()
    await js(
      `document.querySelector('[data-file-id="${file.id}"] button').focus()`,
    )
    window.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'Right',
      modifiers: ['shift'],
    })
    window.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: 'Right',
      modifiers: ['shift'],
    })
    await waitFor(
      `document.querySelector('[data-file-id="${secondFile.id}"]').dataset.selected === 'true'`,
    )
    await openMenu(file.id)
    assert.equal(
      await js(
        `document.querySelectorAll('[data-file-id][data-selected="true"]').length`,
      ),
      2,
    )
    assert.equal(
      await js(
        `Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent === 'Change icon…').hasAttribute('data-disabled')`,
      ),
      true,
    )
    await dismissMenu()
    await js(
      `document.querySelector('[data-file-id="${file.id}"]').parentElement.parentElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`,
    )
    await waitFor(`document.querySelector('[role="menu"]') !== null`)
    assert.equal(
      await js(
        `document.querySelectorAll('[data-file-id][data-selected="true"]').length`,
      ),
      2,
    )
    assert.equal(
      await js(`document.querySelector('[role="menuitem"]').textContent`),
      'Refresh',
    )
    await dismissMenu()
    await openMenu(folder.id)
    assert.equal(
      await js(
        `document.querySelectorAll('[data-file-id][data-selected="true"]').length`,
      ),
      1,
    )
    await dismissMenu()
    assert.equal(
      await js(
        `document.querySelector('[data-file-id="${folder.id}"]').dataset.selected`,
      ),
      'true',
    )
    for (const mode of ['List', 'Grid', 'Masonry']) {
      await js(
        `document.querySelector('button[aria-label="${mode} view"]').click()`,
      )
      await waitFor(
        `document.querySelector('[data-file-id="${file.id}"]')?.tagName ${mode === 'List' ? '===' : '!=='} 'TR'`,
      )
      await clickRow(secondFile.id)
      await assertSelection([secondFile.id])
      await clickRow(folder.id, { shiftKey: true })
      await assertSelection([folder.id, file.id, secondFile.id])
      await clickRow(file.id, { shiftKey: true })
      await assertSelection([file.id, secondFile.id])
      await clickRow(folder.id, { ctrlKey: true })
      await assertSelection([folder.id, file.id, secondFile.id])
      await clickRow(file.id, { ctrlKey: true })
      await assertSelection([folder.id, secondFile.id])
      await clickRow(folder.id, { ctrlKey: true })
      await clickRow(secondFile.id, { ctrlKey: true })
      await assertSelection([])
      await clickRow(file.id, { metaKey: true })
      await assertSelection([file.id])
      await clickRow(secondFile.id, { ctrlKey: true })
      await clickRow(folder.id, { ctrlKey: true, shiftKey: true })
      await assertSelection([folder.id, file.id, secondFile.id])
      await clickRow(file.id)
      await assertSelection([file.id])
      await js(
        `document.querySelector('[data-file-id="${file.id}"] button').focus()`,
      )
      window.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: 'A',
        modifiers: ['control'],
      })
      window.webContents.sendInputEvent({
        type: 'keyUp',
        keyCode: 'A',
        modifiers: ['control'],
      })
      await assertSelection([folder.id, file.id, secondFile.id])
      await js(
        `document.querySelector('[data-file-id="${file.id}"]').parentElement.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))`,
      )
      await assertSelection([])
      await openMenu(file.id)
      assert.equal(
        await js(
          `document.querySelector('[data-file-id="${file.id}"]').dataset.selected`,
        ),
        'true',
      )
      assert.equal(
        await js(
          `document.querySelector('[data-file-id="${folder.id}"]').dataset.selected`,
        ),
        'false',
      )
      await dismissMenu()
      await clickRow(folder.id)
      await assertSelection([folder.id])
      assert.equal(await js('location.hash'), `#/collections/${collection.id}`)
      await js(
        `document.querySelector('[data-file-id="${folder.id}"] a').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }))`,
      )
      await waitFor(`location.hash.startsWith('#/location?')`)
      await waitFor(
        `document.querySelector('[data-filesystem-path]')?.dataset.filesystemPath === ${JSON.stringify(join(directory, 'Design'))}`,
      )
      assert.equal(
        await js(
          `new URLSearchParams(location.hash.split('?')[1]).get('path')`,
        ),
        join(directory, 'Design'),
      )
      await js(`location.hash = '/collections/${collection.id}'`)
      await waitFor(
        `document.querySelector('[data-file-id="${file.id}"]') !== null`,
      )
    }
    await waitFor(
      `document.querySelector('[data-file-id="${folder.id}"] a') !== null`,
    )
    await js(
      `document.querySelector('[data-file-id="${folder.id}"] a').focus()`,
    )
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await waitFor(`location.hash.startsWith('#/location?')`)
    await waitFor(
      `document.querySelector('[data-filesystem-path]')?.dataset.filesystemPath === ${JSON.stringify(join(directory, 'Design'))}`,
    )
    await js(`location.hash = '/collections/${collection.id}'`)
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
    await openMenu(file.id)
    assert.equal(
      await js(`(() => {
        const row = document.querySelector('[data-file-id="${file.id}"]')
        return getComputedStyle(row.querySelector('[data-color="blue"] svg')).color === getComputedStyle(row).color
      })()`),
      true,
      'Custom file icons inherit the selected row color',
    )
    await dismissMenu()

    // Folder customization remains available through the context menu.
    await openRow(folder.id)
    await js(
      `document.querySelector('dialog button[aria-label="palette"]').click()`,
    )
    await clickText('Apply')
    await waitFor(`document.querySelector('dialog') === null`)
    assert.equal(
      (await api.appearance.list()).find(
        (row) => row.target.relativePath === 'Design',
      ).icon.name,
      'lucide:palette',
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
      'Icon UI passed: context menu, selection, color, restart, folder, upload, collection, reset. Screenshot:',
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
