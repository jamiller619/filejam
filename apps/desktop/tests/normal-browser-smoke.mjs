import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join, toNamespacedPath } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow, ipcMain } from 'electron'
import { verifyVisibility } from './visibility-smoke.mjs'

const userData = process.env.FILEJAM_TEST_USER_DATA
assert.ok(userData)
app.setPath('userData', userData)
const channels = []
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => {
  channels.push(channel)
  return handle(channel, listener)
}
const deadline = setTimeout(() => {
  console.error('Smoke deadline')
  app.exit(1)
}, 90000)
async function until(predicate, label) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (await predicate()) {
      return
    }
    await delay(50)
  }
  throw new Error(`Normal app smoke timed out: ${label}`)
}
async function run() {
  try {
    await import('../dist/index.js')
    await app.whenReady()
    await until(() => BrowserWindow.getAllWindows().length === 1, 'window')
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.setBackgroundThrottling(false)
    window.webContents.on('console-message', (_event, _level, message) => {
      if (/error|failed/i.test(message)) {
        console.log('Renderer:', message)
      }
    })
    const evaluate = (script) =>
      window.webContents.executeJavaScript(`(async () => (${script}))()`)
    await until(
      () =>
        evaluate(
          'Boolean(document.querySelector("nav[aria-label=\\"Main navigation\\"]"))',
        ),
      'original navbar',
    )
    assert.equal(
      channels.some((channel) => channel.startsWith('scanner:')),
      false,
    )
    assert.equal(window.webContents.getLastWebPreferences().sandbox, true)
    assert.equal(
      await evaluate('document.querySelectorAll("a[href*=libraries]").length'),
      0,
    )
    assert.equal(
      await evaluate(
        'Boolean(document.querySelector("[data-testid=browser]"))',
      ),
      false,
    )
    assert.equal(
      await evaluate('(await window.filejam.libraries.list()).length'),
      0,
    )
    assert.ok(
      await evaluate(
        'document.querySelector("nav[aria-label=\\"Main navigation\\"]").textContent.includes("Locations")',
      ),
    )
    const folder = join(userData, 'folder')
    const preferenceKey = `filejam:table:v1:${JSON.stringify(['/location', folder, null, null, null])}`
    await evaluate(
      `localStorage.setItem(${JSON.stringify(preferenceKey)}, JSON.stringify({ viewMode: 'list', sorting: [{ id: 'name', desc: true }] }))`,
    )
    const route = `#/location?${new URLSearchParams({ path: folder })}`
    await evaluate(`location.hash = ${JSON.stringify(route)}`)
    await until(
      () =>
        evaluate(
          `document.querySelector('[data-files-ready="true"]')?.dataset.filesystemPath === ${JSON.stringify(folder)}`,
        ),
      'Rust folder listing',
    )
    assert.equal(
      await evaluate(
        'document.querySelectorAll("table[aria-label=\\"Folder contents\\"]").length',
      ),
      1,
    )
    assert.ok(
      await evaluate(
        'Boolean(document.querySelector("button[aria-label=\\"Show details for direct.txt\\"]"))',
      ),
    )
    assert.deepEqual(
      await evaluate(
        `[...document.querySelectorAll('tr[data-file-id] [data-column="name"]')].map(cell => cell.querySelector('button[title], a[title]').title)`,
      ),
      ['zebra.txt', 'pixel.png', 'direct.txt', 'child'],
    )
    const setSearch = (value) =>
      evaluate(
        `(() => { const input = document.querySelector('input[type="search"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
      )
    await setSearch('direct')
    await until(
      () =>
        evaluate(
          `document.querySelector('[data-files-ready="true"]') && document.querySelectorAll('tr[data-file-id]').length === 1`,
        ),
      'filtered view',
    )
    assert.equal(
      await evaluate(
        `document.querySelector('tr[data-file-id] button[title]').title`,
      ),
      'direct.txt',
    )
    await setSearch('')
    await until(
      () =>
        evaluate(`document.querySelectorAll('tr[data-file-id]').length === 4`),
      'cleared filter',
    )
    // Entries are enumerated by Rust, not stored in libraries. Real metadata reaches the existing views.
    const listing = await evaluate(
      `window.filejam.filesystem.list({ path: ${JSON.stringify(folder)}, search: '', recursive: false, pane: 'secondary' })`,
    )
    assert.equal(
      listing.entries.find((entry) => entry.name === 'direct.txt').size,
      5,
    )
    assert.equal(
      listing.entries.find((entry) => entry.name === 'direct.txt').indexedAt,
      null,
    )
    assert.equal(listing.entries.length, 4)
    const flattened = await evaluate(
      `window.filejam.filesystem.list({ path: ${JSON.stringify(folder)}, search: 'nested', recursive: true, pane: 'secondary' })`,
    )
    assert.deepEqual(
      flattened.entries.map((entry) => entry.name),
      ['nested.txt'],
    )
    assert.equal(
      await evaluate(
        `window.filejam.filesystem.list({ path: 'relative', search: '', recursive: false, pane: 'secondary' }).then(() => false, () => true)`,
      ),
      true,
    )
    const previewUrl = `filejam-preview://preview-image?${new URLSearchParams({ libraryId: '0', path: join(folder, 'pixel.png'), width: '64', height: '64' })}`
    assert.equal(
      await evaluate(
        `new Promise(resolve => { const img = new Image(); img.onload = () => resolve(200); img.onerror = () => resolve(500); img.src = ${JSON.stringify(previewUrl)} })`,
      ),
      200,
    )
    await until(
      () =>
        evaluate(
          `[...document.images].some(img => new URL(img.src).searchParams.get('path')?.endsWith('child') && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0 && img.getBoundingClientRect().height > 0)`,
        ),
      'visible folder artwork',
    )
    const directoryPreview = `filejam-preview://preview-image?${new URLSearchParams({ libraryId: '0', path: join(folder, 'child'), variant: 'grid' })}`
    assert.equal(
      await evaluate(
        `new Promise(resolve => { const img = new Image(); img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = ${JSON.stringify(directoryPreview)} })`,
      ),
      true,
    )
    for (const mode of ['Grid', 'Masonry', 'List']) {
      await evaluate(
        `document.querySelector('button[aria-label="${mode} view"]').click()`,
      )
      await until(
        () =>
          evaluate(
            `document.querySelector('button[aria-label="${mode} view"]')?.getAttribute('aria-pressed') === 'true'`,
          ),
        `${mode} view`,
      )
    }
    await evaluate(
      `document.querySelector('button[aria-label="Show details for direct.txt"]').click()`,
    )
    await until(
      () =>
        evaluate(
          `Boolean(document.querySelector('[aria-label="File details: direct.txt"]'))`,
        ),
      'original details pane',
    )
    await evaluate(
      `document.querySelector('button[aria-label="Open split view"]').click()`,
    )
    await until(
      () =>
        evaluate(
          `document.querySelectorAll('[data-files-ready="true"]').length === 2`,
        ),
      'independent split panes',
    )
    await evaluate(
      `document.querySelector('button[aria-label="Close split view"]').click()`,
    )
    const favorites = await evaluate(
      `window.filejam.settings.get('user.favoriteFolders')`,
    )
    if (process.env.FILEJAM_SMOKE_SECOND === '1') {
      assert.ok(favorites.includes(folder))
      await evaluate(
        `document.querySelector('button[aria-label="Remove from favorites"]').click()`,
      )
    } else {
      await evaluate(
        `document.querySelector('button[aria-label="Add to favorites"]').click()`,
      )
    }
    await until(
      async () =>
        (
          await evaluate(`window.filejam.settings.get('user.favoriteFolders')`)
        ).includes(folder) ===
        (process.env.FILEJAM_SMOKE_SECOND !== '1'),
      'favorite persistence',
    )
    // Folder links and back navigation remain part of the original router.
    await evaluate(
      `[...document.querySelectorAll('a')].find(a => a.title === 'child').click()`,
    )
    await until(
      () =>
        evaluate(
          `document.querySelector('[data-files-ready="true"]')?.dataset.filesystemPath === ${JSON.stringify(toNamespacedPath(join(folder, 'child')))}`,
        ),
      'child navigation',
    )
    await evaluate(
      `document.querySelector('button[aria-label="Back"]').click()`,
    )
    await until(
      () =>
        evaluate(
          `document.querySelector('[data-files-ready="true"]')?.dataset.filesystemPath === ${JSON.stringify(folder)}`,
        ),
      'back navigation',
    )
    await evaluate(
      `document.querySelector('button[aria-label="Refresh folder"]').click()`,
    )
    assert.equal(
      await evaluate('(await window.filejam.libraries.list()).length'),
      0,
    )
    if (process.env.FILEJAM_SMOKE_SECOND !== '1') {
      const started = performance.now()
      const large = await evaluate(
        `window.filejam.filesystem.list({ path: ${JSON.stringify(join(userData, 'large'))}, search: '', recursive: false, pane: 'secondary' })`,
      )
      assert.equal(large.entries.length, 10000)
      console.log(
        `Rust-to-existing-view adapter: 10,000 entries with metadata in ${Math.round(performance.now() - started)} ms`,
      )
      await writeFile(
        join(process.cwd(), '.poc-output', 'restored-shell.png'),
        (await window.webContents.capturePage()).toPNG(),
      )
      await evaluate(
        `location.hash = ${JSON.stringify(`#/location?${new URLSearchParams({ path: join(userData, 'large') })}`)}`,
      )
      await until(
        () =>
          evaluate(
            `document.querySelector('[data-files-ready="true"]')?.dataset.filesystemPath === ${JSON.stringify(join(userData, 'large'))}`,
          ),
        '10,000-entry UI',
      )
      const renderedRows = await evaluate(
        `document.querySelectorAll('tr[data-file-id]').length`,
      )
      assert.ok(
        renderedRows > 0 && renderedRows < 100,
        `Virtualized ${renderedRows} rows`,
      )
    }
    console.log(
      'Original shell + Rust data: list/grid/masonry, details, previews, split panes, navigation, favorites and no library creation passed',
    )
    await verifyVisibility({ evaluate, until, userData })
    await evaluate(`location.hash = '#/settings'`)
    await until(
      () =>
        evaluate(
          `Boolean([...document.querySelectorAll('button')].findLast(button => button.textContent.includes('Add collection')))`,
        ),
      'collection editor action',
    )
    await evaluate(
      `[...document.querySelectorAll('button')].findLast(button => button.textContent.includes('Add collection')).click()`,
    )
    await until(
      () =>
        evaluate(
          `Boolean(document.querySelector('input[aria-label="Collection name"]'))`,
        ),
      'collection details editor',
    )
    await evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Collection name"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Unsaved collection')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await evaluate(
      `document.querySelector('[aria-label="Settings details"] button[aria-label="Match"]').click()`,
    )
    await until(
      () =>
        evaluate(
          `Boolean([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('Any rule')))`,
        ),
      'portaled match menu remains open',
    )
    await evaluate(`(() => {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('Any rule'))
      item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      item.focus()
      item.click()
      window.dispatchEvent(new Event('blur'))
    })()`)
    await until(
      () =>
        evaluate(
          `document.querySelector('[aria-label="Settings details"] button[aria-label="Match"]')?.textContent.includes('Any rule')`,
        ),
      'collection details persist through menu interaction and window blur',
    )
    assert.equal(
      await evaluate(
        `document.querySelector('input[aria-label="Collection name"]').value`,
      ),
      'Unsaved collection',
    )
    clearTimeout(deadline)
    app.quit()
  } catch (error) {
    console.error(error)
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      console.error(
        await window.webContents
          .executeJavaScript('document.body.innerText')
          .catch(() => 'no renderer'),
      )
    }
    clearTimeout(deadline)
    app.exit(1)
  }
}
void run()
