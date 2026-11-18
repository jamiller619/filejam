import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import sharp from 'sharp'

const directory = await mkdtemp(join(tmpdir(), 'filejam-normal-browser-'))
try {
  await mkdir(join(directory, 'folder'))
  await mkdir(join(directory, 'folder', 'child'))
  await writeFile(join(directory, 'folder', 'direct.txt'), 'hello')
  await writeFile(join(directory, 'folder', 'zebra.txt'), 'last')
  await writeFile(join(directory, 'folder', 'child', 'nested.txt'), 'nested')
  await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#22aaff' },
  })
    .png()
    .toFile(join(directory, 'folder', 'pixel.png'))
  await mkdir(join(directory, 'large'))
  for (let offset = 0; offset < 10000; offset += 100) {
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        writeFile(join(directory, 'large', `file-${offset + i}.txt`), 'x'),
      ),
    )
  }
  const visibility = join(directory, 'visibility')
  await mkdir(join(visibility, '.hidden-folder'), { recursive: true })
  await writeFile(join(visibility, 'visible.txt'), '')
  await writeFile(join(visibility, '.secret'), '')
  await writeFile(join(visibility, '.hidden-folder', 'nested.txt'), '')
  if (process.platform === 'win32') {
    await writeFile(join(visibility, 'hidden.txt'), '')
    await writeFile(join(visibility, 'system.txt'), '')
    execFileSync('attrib', ['+H', join(visibility, 'hidden.txt')])
    execFileSync('attrib', ['+H', '+S', join(visibility, 'system.txt')])
  }
  const config = join(directory, 'config.json')
  await writeFile(
    config,
    JSON.stringify({
      'appdata.path': directory,
      'appdata.dbPath': join(directory, 'database'),
      'appdata.cachePath': join(directory, 'cache'),
      'appdata.logsPath': join(directory, 'logs'),
    }),
  )
  for (const second of ['0', '1']) {
    const env = {
      ...process.env,
      FILEJAM_TEST_USER_DATA: directory,
      FILEJAM_CONFIG_FILE: config,
      FILEJAM_SMOKE_SECOND: second,
    }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.FILEJAM_BROWSER_POC
    const child = spawn(
      electron,
      [fileURLToPath(new URL('./normal-browser-smoke.mjs', import.meta.url))],
      { env, stdio: 'inherit', timeout: 100000 },
    )
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    assert.equal(code, 0)
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
