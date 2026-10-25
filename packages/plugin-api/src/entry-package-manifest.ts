import type { EntryManifest } from './entry-manifest.js'

/** The filejamApp field in an entry provider's package.json. */
export interface EntryPackageManifest
  extends Omit<EntryManifest, 'id' | 'version'> {
  type: 'entry'
}
