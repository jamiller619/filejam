import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow } from 'electron'

const timeout = setTimeout(() => {
  console.error('Desktop smoke test timed out')
  app.exit(1)
}, 60000)

// Do not await readiness at module scope: Electron waits for its ESM entry to load.
async function run() {
  try {
    console.log('Loading desktop entry')
    await import('../dist/index.js')
    console.log('Waiting for Electron readiness')
    await app.whenReady()
    console.log('Electron ready; waiting for renderer')

    let text

    for (let attempt = 0; attempt < 200; attempt++) {
      const window = BrowserWindow.getAllWindows()[0]

      if (window && !window.webContents.isLoading()) {
        text = await window.webContents.executeJavaScript(
          'document.querySelector("#root h2")?.textContent',
        )

        if (text === 'Home') {
          assert.equal(window.webContents.getLastWebPreferences().sandbox, true)

          assert.equal(
            await window.webContents.executeJavaScript('typeof require'),
            'undefined',
          )

          break
        }
      }

      await delay(50)
    }

    assert.equal(text, 'Home')

    const window = BrowserWindow.getAllWindows()[0]

    // Exercise the same renderer-initiated reload that Vite uses as its fallback.
    await Promise.all([
      once(window.webContents, 'did-finish-load', {
        signal: AbortSignal.timeout(10000),
      }),
      window.webContents.executeJavaScript(
        'setTimeout(() => location.reload(), 0); undefined',
      ),
    ])

    const scanner = await window.webContents.executeJavaScript(
      'window.scanner.status()',
    )

    assert.equal(scanner.state, 'idle')

    await window.webContents.executeJavaScript(`
      window.scanUpdates = 0;
      window.stopScanUpdates = window.scanner.onUpdated(() => window.scanUpdates++);
      undefined
    `)

    window.webContents.send('scanner:updated')

    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await window.webContents.executeJavaScript('window.scanUpdates === 1')
      ) {
        break
      }

      await delay(10)
    }

    assert.equal(
      await window.webContents.executeJavaScript('window.scanUpdates'),
      1,
    )

    await window.webContents.executeJavaScript(
      'window.stopScanUpdates(); undefined',
    )

    window.webContents.send('scanner:updated')
    await delay(50)

    assert.equal(
      await window.webContents.executeJavaScript('window.scanUpdates'),
      1,
    )

    const libraries = await window.webContents.executeJavaScript(
      'window.files.libraries.list()',
    )

    assert.ok(Array.isArray(libraries))

    for (const library of libraries) {
      assert.equal(typeof library.id, 'number')
      assert.equal(typeof library.name, 'string')
      assert.equal(typeof library.rootPath, 'string')
    }

    if (libraries[0]) {
      const library = libraries[0]

      await window.webContents.executeJavaScript(
        `location.hash = ${JSON.stringify('#/libraries/')} + ${library.id}; undefined`,
      )

      let heading

      for (let attempt = 0; attempt < 100; attempt++) {
        heading = await window.webContents.executeJavaScript(
          'document.querySelector("#root h2")?.textContent',
        )

        if (heading === library.name) {
          break
        }

        await delay(50)
      }

      assert.equal(
        heading,
        library.name,
        'Library route renders the selected folder',
      )

      assert.equal(
        await window.webContents.executeJavaScript(
          `Boolean(document.querySelector('nav[aria-label="Folder breadcrumbs"]'))`,
        ),
        true,
      )
    }

    console.log(
      'Desktop smoke test passed: Home renders, renderer reloads, and scanner bridge responds',
    )

    app.once('will-quit', () => clearTimeout(timeout))
    app.quit()
  } catch (error) {
    console.error(error)
    clearTimeout(timeout)
    app.exit(1)
  }
}

void run()
