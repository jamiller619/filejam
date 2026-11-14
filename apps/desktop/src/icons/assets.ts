import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

export const maximumIconBytes = 2 * 1024 * 1024

/** Decode in the trusted process with bounded allocation, then discard metadata. */
export async function normalizeIcon(bytes: Uint8Array) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length === 0 ||
    bytes.length > maximumIconBytes
  ) {
    throw new Error('Choose a PNG, JPEG, or WebP image smaller than 2 MB.')
  }

  const image = sharp(bytes, {
    limitInputPixels: 16_777_216,
    failOn: 'warning',
  })
  const metadata = await image.metadata()

  if (
    !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new Error('Choose a still PNG, JPEG, or WebP image.')
  }

  return image
    .rotate()
    .resize(256, 256, { fit: 'contain', background: '#00000000' })
    .png()
    .toBuffer()
}

export async function storeIcon(directory: string, bytes: Uint8Array) {
  const normalized = await normalizeIcon(bytes)
  const id = createHash('sha256').update(normalized).digest('hex')

  await mkdir(directory, { recursive: true })

  try {
    await writeFile(join(directory, `${id}.png`), normalized, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }

  return id
}

export function createIconHandler(directory: string) {
  return async (request: Request) => {
    const url = new URL(request.url)
    const id = url.pathname.slice(1)

    if (
      request.method !== 'GET' ||
      url.hostname !== 'asset' ||
      !/^[a-f0-9]{64}$/.test(id)
    ) {
      return new Response(null, { status: 404 })
    }

    try {
      const bytes = await readFile(join(directory, `${id}.png`))

      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}
