import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

// Editor terminals may set this for their own subprocesses; Electron needs GUI mode.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(
  electron,
  [fileURLToPath(new URL('../', import.meta.url)), ...process.argv.slice(2)],
  { env, stdio: 'inherit' },
)
child.once('error', (error) => {
  console.error('Unable to launch Electron', error)
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 1
})
