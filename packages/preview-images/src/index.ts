import { readFile } from 'node:fs/promises'
import type { PreviewProvider } from '@files/plugin-api'
import { imageMimeType } from './formats.js'

const provider: PreviewProvider = {
  async generate(request, { signal }) {
    const mimeType = imageMimeType(request.source.path)

    if (!mimeType) {
      return { status: 'unsupported' }
    }

    // Preserve animation, vector scaling, and formats Chromium already supports.
    if (request.source.size > 32 * 1024 * 1024) {
      return { status: 'error', message: 'Image exceeds preview byte limit' }
    }

    const bytes = await readFile(request.source.path, { signal })

    return { status: 'success', bytes, mimeType }
  },
}

export default provider
