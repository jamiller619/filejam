import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { createBrowserFixture } from './browser-fixtures.mjs'

const directory = await mkdtemp(join(tmpdir(), 'filejam-browser-'))
const userData = join(directory, 'user-data')
const config = join(directory, 'invalid-legacy-config.json')
let child
const deadline = setTimeout(() => {
  child?.kill()
}, 60000)

try {
  await createBrowserFixture(directory)
  await writeFile(config, '{ deliberately invalid JSON')

  const env = {
    ...process.env,
    FILEJAM_BROWSER_POC: '1',
    FILEJAM_TEST_USER_DATA: userData,
    FILEJAM_CONFIG_FILE: config,
    FILEJAM_SMOKE_SHUTDOWN: process.argv.includes('--shutdown') ? '1' : '0',
  }
  delete env.ELECTRON_RUN_AS_NODE

  child = spawn(
    electron,
    [fileURLToPath(new URL('./browser-smoke.mjs', import.meta.url))],
    { env, stdio: 'inherit' },
  )

  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => {
      resolve(exitCode ?? (signal ? 1 : 0))
    })
  })

  assert.equal(code, 0, 'Electron proof smoke must exit cleanly')
  console.log('Isolated Electron user data and fixture cleaned by runner')
} finally {
  clearTimeout(deadline)
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill()
  }
  await rm(directory, { recursive: true, force: true })
}
