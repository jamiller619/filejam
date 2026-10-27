import { spawn } from 'node:child_process'
import { access, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function manifestResourceIsCurrent(source) {
  const manifest = join(source, 'filejam-mft.manifest')
  const resourceScript = join(source, 'filejam-mft.rc')
  const resource = join(source, 'manifest_windows_amd64.syso')

  try {
    await access(resource)

    const [manifestStats, scriptStats, resourceStats] = await Promise.all([
      stat(manifest),
      stat(resourceScript),
      stat(resource),
    ])

    return (
      resourceStats.mtimeMs >= manifestStats.mtimeMs &&
      resourceStats.mtimeMs >= scriptStats.mtimeMs
    )
  } catch {
    return false
  }
}

async function buildManifestResource(source) {
  if (await manifestResourceIsCurrent(source)) {
    return
  }

  await new Promise((resolve, reject) => {
    const build = spawn(
      'windres',
      ['--target=pe-x86-64', 'filejam-mft.rc', 'manifest_windows_amd64.syso'],
      { cwd: source, stdio: 'inherit' },
    )

    build.once('error', (error) => {
      reject(
        new Error('Building the MFT helper manifest requires windres on PATH', {
          cause: error,
        }),
      )
    })
    build.once('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`MFT helper manifest build failed (${code})`))
      }
    })
  })
}

export async function buildMftHelper() {
  if (process.platform !== 'win32') {
    return
  }

  const source = fileURLToPath(
    new URL('../../../packages/server/helpers/mft/', import.meta.url),
  )
  const destination = fileURLToPath(new URL('../dist/bin/', import.meta.url))

  await mkdir(destination, { recursive: true })
  await buildManifestResource(source)

  await new Promise((resolve, reject) => {
    const build = spawn(
      'go',
      ['build', '-trimpath', '-o', join(destination, 'filejam-mft.exe'), '.'],
      { cwd: source, stdio: 'inherit' },
    )

    build.once('error', reject)
    build.once('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`MFT helper build failed (${code})`))
      }
    })
  })
}
