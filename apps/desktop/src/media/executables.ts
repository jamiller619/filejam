import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PreviewExecutables } from '@files/plugin-api'

function bundledExecutable(name: keyof PreviewExecutables) {
  const filename = `${name}${process.platform === 'win32' ? '.exe' : ''}`
  const bundled = fileURLToPath(new URL(`../bin/${filename}`, import.meta.url))
  const executable = bundled.replace('app.asar', 'app.asar.unpacked')

  if (!existsSync(executable)) {
    throw new Error(`Bundled ${name} executable is unavailable`)
  }

  return executable
}

export const mediaExecutables: PreviewExecutables = {
  ffmpeg: bundledExecutable('ffmpeg'),
  ffprobe: bundledExecutable('ffprobe'),
}
