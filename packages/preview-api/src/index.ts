export const PREVIEW_API_VERSION = 1

export interface PreviewManifest {
  id: string
  version: string
  apiVersion: 1
  extensions: string[]
  mimeTypes: string[]
  capabilities: { original: boolean }
}

/** The filesApp field in a preview provider's package.json. */
export interface PreviewPackageManifest
  extends Omit<PreviewManifest, 'id' | 'version'> {
  type: 'preview'
}

export interface PreviewRequest {
  source: { path: string; size: number; modifiedAt: number }
  width: number
  height: number
  purpose: 'thumbnail' | 'detail'
}

export interface PreviewContext {
  signal: AbortSignal
  log: (message: string) => void
}

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

/** Providers execute as trusted installed code, not in a security sandbox. */
export interface PreviewProvider {
  generate(
    request: PreviewRequest,
    context: PreviewContext,
  ): Promise<PreviewResult>
}
