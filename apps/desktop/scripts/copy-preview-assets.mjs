import { cp, mkdir } from 'node:fs/promises'

export async function copyPreviewAssets() {
  const destination = new URL('../dist/preview/assets/', import.meta.url)
  await mkdir(destination, { recursive: true })
  await cp(
    new URL('../../../packages/ui/src/assets/icons/', import.meta.url),
    destination,
    { recursive: true },
  )
  await cp(
    new URL('../src/renderer/assets/folder.svg', import.meta.url),
    new URL('folder-art.svg', destination),
  )
}
