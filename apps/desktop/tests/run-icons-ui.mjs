import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const env = { ...process.env }

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(
  electron,
  [fileURLToPath(new URL('./icons-ui.mjs', import.meta.url))],
  {
    env,
    stdio: 'inherit',
    timeout: 60000,
    windowsHide: true,
  },
)
const code = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', resolve)
})

assert.equal(code, 0, 'Icon UI test must exit cleanly')
