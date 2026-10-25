import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const directory = await mkdtemp(join(tmpdir(), 'filejam-desktop-'))

try {
  const config = join(directory, 'config.json')

  await writeFile(
    config,
    JSON.stringify({
      'appdata.dbPath': join(directory, 'db'),
      'appdata.cachePath': join(directory, 'cache'),
      'appdata.logsPath': join(directory, 'logs'),
    }),
  )

  const env = {
    ...process.env,
    FILEJAM_CONFIG_FILE: config,
    FILEJAM_TEST_USER_DATA: directory,
  }

  delete env.ELECTRON_RUN_AS_NODE

  const child = spawn(
    electron,
    [
      ...process.argv.slice(2),
      fileURLToPath(new URL('./smoke.mjs', import.meta.url)),
    ],
    { env, stdio: 'inherit', timeout: 75000 },
  )

  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })

  assert.equal(code, 0, 'Electron must exit cleanly')

  const logs = await readFile(join(directory, 'logs/current.jsonl'), 'utf8')

  assert.match(logs, /Server started/)
  assert.match(logs, /Server stopped/)
  console.log('Server startup and shutdown logs verified')
} finally {
  await rm(directory, { recursive: true, force: true })
}
