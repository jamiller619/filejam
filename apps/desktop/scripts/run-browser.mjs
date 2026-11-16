import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const env = { ...process.env, FILEJAM_BROWSER_POC: '1' }

delete env.ELECTRON_RUN_AS_NODE

const child = spawn(
  electron,
  [fileURLToPath(new URL('../', import.meta.url))],
  { env, stdio: 'inherit' },
)

child.once('error', (error) => {
  console.error('Unable to launch the browser proof', error)
  process.exitCode = 1
})

child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
