export type PreviewResult =
  | {
      status: 'success'
      bytes: Uint8Array
      mimeType: string
      width?: number
      height?: number
      metadata?: Record<string, string | number>
    }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }
