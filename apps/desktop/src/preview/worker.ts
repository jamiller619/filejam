import { pathToFileURL } from 'node:url'
import type {
  PreviewExecutables,
  PreviewProvider,
  PreviewRequest,
} from '@files/preview-api'

const controller = new AbortController()

process.parentPort?.on(
  'message',
  async ({
    data,
  }: {
    data:
      | { type: 'cancel' }
      | {
          type: 'generate'
          entry: string
          executables: PreviewExecutables
          request: PreviewRequest
        }
  }) => {
    if (data.type === 'cancel') {
      controller.abort()

      return
    }

    try {
      const provider = (await import(pathToFileURL(data.entry).href))
        .default as PreviewProvider

      if (typeof provider?.generate !== 'function') {
        throw new Error('Provider must export generate')
      }

      const result = await provider.generate(data.request, {
        executables: data.executables,
        signal: controller.signal,
        log: (message) => console.info(message),
      })

      process.parentPort?.postMessage(result)
    } catch (error) {
      process.parentPort?.postMessage({
        status: 'error',
        message: error instanceof Error ? error.message : 'Preview failed',
      })
    }
  },
)
