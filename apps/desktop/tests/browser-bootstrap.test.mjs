import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createProofCleanup,
  proofWindowOptions,
  resolveProofPaths,
} from '../dist/browser/bootstrap.js'

test('proof paths resolve from the module URL independently of cwd', () => {
  const moduleUrl = new URL('../dist/browser/bootstrap.js', import.meta.url)
    .href
  const paths = resolveProofPaths(moduleUrl, 'win32')

  assert.equal(
    paths.executable,
    fileURLToPath(
      new URL(
        '../dist/browser/../../../../packages/fs-service/target/release/filejam-fs-service.exe',
        import.meta.url,
      ),
    ),
  )
  assert.equal(
    paths.preload,
    fileURLToPath(new URL('../dist/browser/preload.cjs', import.meta.url)),
  )
  assert.equal(
    paths.renderer,
    fileURLToPath(new URL('../dist/renderer/index.html', import.meta.url)),
  )
})

test('proof window uses isolated renderer preferences and native framing', () => {
  const options = proofWindowOptions('/proof/preload.cjs')

  assert.equal(options.width, 1100)
  assert.equal(options.height, 800)
  assert.equal(options.frame, undefined)
  assert.deepEqual(options.webPreferences, {
    preload: '/proof/preload.cjs',
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  })
})

test('repeated close disposes IPC and closes the owned client once', async () => {
  const calls = []
  let finishClose
  const cleanup = createProofCleanup({
    client: {
      close() {
        calls.push('client.close')
        return new Promise((resolve) => {
          finishClose = resolve
        })
      },
    },
    disposeIpc() {
      calls.push('dispose')
    },
    closeWindow() {
      calls.push('window.close')
    },
  })

  const first = cleanup()
  const second = cleanup()
  assert.equal(first, second)
  assert.deepEqual(calls, ['dispose', 'window.close', 'client.close'])
  finishClose()
  await first
})
