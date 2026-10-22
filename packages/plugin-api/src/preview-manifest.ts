export interface PreviewManifest {
  id: string
  version: string
  apiVersion: 1
  extensions: string[]
  mimeTypes: string[]
  capabilities: { original: boolean }
}
