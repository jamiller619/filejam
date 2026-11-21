import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const root = await mkdtemp(join(tmpdir(), 'filejam-operation-smoke-'))

try {
  await mkdir(join(root, 'source', 'folder'), { recursive: true })
  await mkdir(join(root, 'destination'))
  await writeFile(join(root, 'source', 'note.txt'), 'note')
  await writeFile(join(root, 'source', 'folder', 'nested.txt'), 'nested')
  const config = join(root, 'config.json')
  await writeFile(
    config,
    JSON.stringify({
      'appdata.path': root,
      'appdata.dbPath': join(root, 'database'),
      'appdata.cachePath': join(root, 'cache'),
      'appdata.logsPath': join(root, 'logs'),
    }),
  )
  const env = {
    ...process.env,
    FILEJAM_TEST_USER_DATA: root,
    FILEJAM_CONFIG_FILE: config,
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.FILEJAM_BROWSER_POC
  const child = spawn(
    electron,
    [fileURLToPath(new URL('./file-operations-smoke.ts', import.meta.url))],
    { env, stdio: 'inherit', timeout: 90000 },
  )
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })

  assert.equal(code, 0)
} finally {
  await rm(root, { recursive: true, force: true })
}
