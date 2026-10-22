import type { PreviewContext } from './preview-context.js'
import type { PreviewRequest } from './preview-request.js'
import type { PreviewResult } from './preview-result.js'

/** Providers execute as trusted installed code, not in a security sandbox. */
export interface PreviewProvider {
  generate(
    request: PreviewRequest,
    context: PreviewContext,
  ): Promise<PreviewResult>
}
