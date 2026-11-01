import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { app, BrowserWindow } from 'electron'
import { inlineCssModules } from 'inline-css-modules/vite'
import { createServer } from 'vite'
import { createApi } from '../../../packages/server/dist/api/index.js'
import { initDatabase } from '../../../packages/server/dist/db/index.js'
import { registerApiIpc } from '../dist/api/main.js'
import { registerWindowIpc } from '../dist/ipc/window.js'
import { createSettingsApi, initSettings } from '../dist/settings/index.js'

async function run() {
  // Keep the process alive through cleanup so failures retain their exit code.
  app.on('window-all-closed', () => {})

  const directory = await mkdtemp(join(tmpdir(), 'filejam-settings-ui-'))
  let server
  let exitCode = 0
  let window
  let connection
  let removeApi
  let removeWindow
  const timeout = setTimeout(() => app.exit(1), 45000)

  try {
    await app.whenReady()

    connection = await initDatabase(join(directory, 'db.sqlite'))
    const { store } = await initSettings(directory)
    const settings = createSettingsApi(store)
    let failSave = false

    server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL('../src/renderer/', import.meta.url)),
      plugins: [
        inlineCssModules(),
        react(),
        {
          name: 'test-development-csp',
          transformIndexHtml(html) {
            return html.replace(
              "script-src 'self';",
              "script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*;",
            )
          },
        },
      ],
      resolve: {
        alias: {
          '~': fileURLToPath(new URL('../src/renderer/', import.meta.url)),
          '@filejam/ui': fileURLToPath(
            new URL('../../../packages/ui/src/index.ts', import.meta.url),
          ),
        },
        dedupe: ['react', 'react-dom'],
      },
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()

    window = new BrowserWindow({
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
    removeApi = registerApiIpc(createApi(connection.db), window.webContents, {
      get: settings.get,
      set: async (key, value) => {
        if (failSave) {
          throw new Error('Test save failure')
        }

        await settings.set(key, value)
      },
    })
    removeWindow = registerWindowIpc(window)

    const js = (code) => window.webContents.executeJavaScript(code)
    const waitFor = async (code) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (await js(`Boolean(${code})`)) {
          return
        }

        await delay(50)
      }

      console.error(await js('document.body.innerText'))
      throw new Error(`Timed out: ${code}`)
    }

    await window.loadURL(`${server.resolvedUrls.local[0]}#/settings`)
    await waitFor(
      `document.querySelector('select[aria-label="Date format"]:not(:disabled)')`,
    )

    assert.equal(
      await js(`document.querySelectorAll('main [role="switch"]').length`),
      2,
    )
    assert.equal(
      await js(`document.querySelector('[aria-label="Navigation width"]')`),
      null,
    )

    await js(
      `document.querySelector('[role="switch"][aria-label="Show file extensions"]').click()`,
    )
    await waitFor(
      `document.querySelector('[role="switch"][aria-label="Show file extensions"]').getAttribute('aria-checked') === 'true' && !document.querySelector('main').textContent.includes('Saving...')`,
    )
    assert.equal(await settings.get('user.files.showExtensions'), true)

    await js(
      `(() => { Array.from(document.querySelectorAll('main button')).find(button => button.textContent.startsWith('Date format')).click(); const select = document.querySelector('select[aria-label="Date format"]'); select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    )
    await waitFor(
      `document.querySelector('aside[aria-label="Settings details"]')?.textContent.includes('Absolute') && !document.querySelector('main').textContent.includes('Saving...')`,
    )
    assert.equal(await settings.get('user.dateformat'), 'absolute')

    await js(
      `document.querySelector('aside[aria-label="Settings details"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`,
    )
    assert.equal(
      await js(
        `document.querySelectorAll('[data-settings-row][data-selected="true"]').length`,
      ),
      1,
    )

    for (const interaction of [
      `document.querySelector('main').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`,
      `document.querySelector('main').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))`,
      `window.dispatchEvent(new Event('blur'))`,
    ]) {
      await js(
        `Array.from(document.querySelectorAll('main button')).find(button => button.textContent.startsWith('Date format')).click()`,
      )
      await waitFor(
        `document.querySelector('[data-settings-row][data-selected="true"]')`,
      )
      await js(interaction)
      await waitFor(
        `!document.querySelector('[data-settings-row][data-selected="true"]')`,
      )
      assert.equal(
        await js(
          `document.querySelector('aside[aria-label="Settings details"]').textContent.includes('Select a setting')`,
        ),
        true,
      )
    }

    failSave = true
    await js(
      `document.querySelector('[role="switch"][aria-label="Show file extensions"]').click()`,
    )
    await waitFor(
      `document.querySelector('main')?.textContent.includes('Unable to save the setting.')`,
    )
    assert.equal(await settings.get('user.files.showExtensions'), true)
    assert.equal(
      await js(
        `document.querySelector('[role="switch"][aria-label="Show file extensions"]').getAttribute('aria-checked')`,
      ),
      'true',
    )

    window.webContents.reload()
    await waitFor(
      `document.querySelector('select[aria-label="Date format"]:not(:disabled)')?.value === '1'`,
    )
    assert.equal(
      await js(
        `document.querySelector('[role="switch"][aria-label="Show file extensions"]').getAttribute('aria-checked')`,
      ),
      'true',
    )
    console.log(
      'Settings UI checks passed: controls, details, persistence, and save failures.',
    )
  } catch (error) {
    console.error(error)
    exitCode = 1
  } finally {
    clearTimeout(timeout)
    window?.destroy()
    removeApi?.()
    removeWindow?.()
    connection?.close()
    await server?.close()
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    app.exit(exitCode)
  }
}

void run()
