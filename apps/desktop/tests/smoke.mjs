import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow } from 'electron'

const timeout = setTimeout(() => {
  console.error('Desktop smoke test timed out')
  app.exit(1)
}, 60000)

const testUserData = process.env.FILEJAM_TEST_USER_DATA

assert.ok(testUserData, 'Smoke test user data must be isolated')
app.setPath('userData', testUserData)

// Do not await readiness at module scope: Electron waits for its ESM entry to load.
async function run() {
  try {
    console.log('Loading desktop entry')
    await import('../dist/index.js')
    console.log('Waiting for Electron readiness')
    await app.whenReady()
    console.log('Electron ready; waiting for renderer')

    let homeRendered = false

    for (let attempt = 0; attempt < 200; attempt++) {
      const window = BrowserWindow.getAllWindows()[0]

      if (window && !window.webContents.isLoading()) {
        homeRendered = await window.webContents.executeJavaScript(
          'Boolean(document.querySelector(\'ul[aria-label="Favorite folders"]\'))',
        )

        if (homeRendered) {
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

    assert.ok(homeRendered, 'Home renders its favorite folders grid')

    const window = BrowserWindow.getAllWindows()[0]

    // Load each route from the production file URL to exercise split JS and CSS.
    for (const [hash, selector, expectedText] of [
      ['#/settings', '#libraries-heading', 'Libraries'],
      [
        '#/collections/smoke-missing',
        '[role="status"]',
        'Collection not found.',
      ],
      ['#/libraries/invalid', '[role="status"]', 'Invalid library.'],
      ['#/', 'ul[aria-label="Favorite folders"]', null],
    ]) {
      const routeUrl = new URL(window.webContents.getURL())

      routeUrl.hash = hash
      await window.loadURL(routeUrl.href)

      let rendered = false

      for (let attempt = 0; attempt < 100; attempt++) {
        rendered = await window.webContents.executeJavaScript(`
          Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
            .some((element) => ${expectedText === null} || element.textContent === ${JSON.stringify(expectedText)})
        `)

        if (rendered) {
          break
        }

        await delay(50)
      }

      assert.ok(rendered, `${hash} renders after loading its route chunk`)
    }

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

    assert.ok(['idle', 'scanning'].includes(scanner.state))

    await window.webContents.executeJavaScript(`
      window.scanUpdates = 0;
      window.stopScanUpdates = window.scanner.onUpdated(() => window.scanUpdates++);
      undefined
    `)

    window.webContents.send('scanner:updated')

    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        await window.webContents.executeJavaScript('window.scanUpdates >= 1')
      ) {
        break
      }

      await delay(10)
    }

    assert.ok(
      await window.webContents.executeJavaScript('window.scanUpdates >= 1'),
    )

    const updatesBeforeUnsubscribe = await window.webContents.executeJavaScript(
      'window.stopScanUpdates(); window.scanUpdates',
    )

    window.webContents.send('scanner:updated')
    await delay(50)

    assert.equal(
      await window.webContents.executeJavaScript('window.scanUpdates'),
      updatesBeforeUnsubscribe,
    )

    const volumes = await window.webContents.executeJavaScript(
      'window.filejam.volumes.list()',
    )

    assert.ok(Array.isArray(volumes))

    for (const volume of volumes) {
      assert.equal(typeof volume.id, 'number')
      assert.equal(typeof volume.name, 'string')
      assert.equal(typeof volume.rootPath, 'string')
    }

    if (volumes[0]) {
      const volume = volumes[0]

      await window.webContents.executeJavaScript(
        `location.hash = ${JSON.stringify('#/browse/')} + ${volume.id}; undefined`,
      )

      let heading

      for (let attempt = 0; attempt < 100; attempt++) {
        heading = await window.webContents.executeJavaScript(
          'document.querySelector(\'nav[aria-label="Folder breadcrumbs"] [aria-current="page"]\')?.textContent',
        )

        if (heading === volume.name) {
          break
        }

        await delay(50)
      }

      assert.equal(
        heading,
        volume.name,
        'Volume route renders the selected folder',
      )

      assert.equal(
        await window.webContents.executeJavaScript(
          `Boolean(document.querySelector('nav[aria-label="Folder breadcrumbs"]'))`,
        ),
        true,
      )
    }

    console.log(
      'Desktop smoke test passed: lazy routes render, renderer reloads, and scanner bridge responds',
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
