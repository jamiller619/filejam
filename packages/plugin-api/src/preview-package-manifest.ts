import type { PreviewManifest } from './preview-manifest.js'

/** The filejamApp field in a preview provider's package.json. */
export interface PreviewPackageManifest
  extends Omit<PreviewManifest, 'id' | 'version'> {
  type: 'preview'
}
