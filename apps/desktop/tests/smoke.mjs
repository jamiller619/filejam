import assert from 'node:assert/strict'
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
          'document.querySelector("#root h1")?.textContent',
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
    const scanner = await window.webContents.executeJavaScript('window.scanner.status()')
    assert.equal(scanner.state, 'idle')
    console.log('Desktop smoke test passed: Home renders and scanner bridge responds')
    app.once('will-quit', () => clearTimeout(timeout))
    app.quit()
  } catch (error) {
    console.error(error)
    clearTimeout(timeout)
    app.exit(1)
  }
}
void run()
