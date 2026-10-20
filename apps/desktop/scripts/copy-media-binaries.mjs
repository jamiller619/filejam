import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function copyMediaBinaries() {
  const root = new URL('../', import.meta.url)
  const require = createRequire(new URL('package.json', root))
  const destination = fileURLToPath(new URL('dist/bin/', root))

  await mkdir(destination, { recursive: true })

  const sources = []

  for (const name of ['ffmpeg-static', '@derhuerst/ffprobe-static']) {
    const binary = require(name)

    if (!binary) {
      throw new Error(
        `Unsupported media platform: ${process.platform}/${process.arch}`,
      )
    }

    await copyFile(binary, join(destination, basename(binary)))

    const packageRoot = dirname(require.resolve(`${name}/package.json`))
    const prefix = name.includes('ffprobe') ? 'ffprobe' : 'ffmpeg'

    for (const file of await readdir(packageRoot)) {
      if (/license|readme/i.test(file)) {
        await copyFile(
          join(packageRoot, file),
          join(destination, `${prefix}-${file}`),
        )
      }
    }

    const pkg = require(`${name}/package.json`)

    sources.push({
      package: name,
      version: pkg.version,
      repository: pkg.repository,
      license: pkg.license,
      platform: process.platform,
      arch: process.arch,
    })
  }

  await writeFile(
    join(destination, 'sources.json'),
    JSON.stringify(sources, null, 2),
  )
}
