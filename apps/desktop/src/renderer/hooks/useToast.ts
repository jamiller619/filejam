import { useToastManager } from '@files/ui'

/** Add, update, close, or track a promise with a toast from anywhere in the app.
 * `add({ title, description, timeout })` returns an ID for `update` and `close`.
 * Toasts auto-dismiss after five seconds; use `timeout: 0` for ongoing work.
 */
export function useToast() {
  return useToastManager()
}
