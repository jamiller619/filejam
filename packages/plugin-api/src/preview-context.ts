import type { PreviewExecutables } from './preview-executables.js'

export interface PreviewContext {
  signal: AbortSignal
  log: (message: string) => void
  executables: PreviewExecutables
}
