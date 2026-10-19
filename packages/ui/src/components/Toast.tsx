import { Toast as BaseToast } from '@base-ui/react/toast'
import { css } from 'inline-css-modules'
import Button from './Button.js'
import Icon from './Icon.js'

const styles = css`
  .viewport {
    position: fixed;
    z-index: 100;
    inset-inline-end: var(--suzy-space-4);
    bottom: var(--suzy-space-4);
    width: min(360px, calc(100vw - 2 * var(--suzy-space-4)));
    display: flex;
    flex-direction: column-reverse;
    gap: var(--suzy-space-2);
    pointer-events: none;
  }
  .toast {
    position: relative;
    padding: var(--suzy-space-3);
    padding-inline-end: calc(var(--suzy-space-4) + 32px);
    border-radius: var(--suzy-radius-3);
    background: var(--suzy-gray-2);
    color: var(--suzy-text);
    overflow-wrap: anywhere;
    pointer-events: auto;
    opacity: 1;
    transition: opacity 150ms ease;
    &[data-starting-style], &[data-ending-style] { opacity: 0; }
    &[data-limited] { display: none; }
  }
  .title {
    font-size: var(--suzy-font-size-4);
    font-weight: 600;
  }
  .description { color: var(--suzy-text-muted); }
  .close {
    position: absolute;
    top: var(--suzy-space-2);
    inset-inline-end: var(--suzy-space-2);
  }
  .action { margin-top: var(--suzy-space-2); }
  @media (prefers-reduced-motion: reduce) {
    .toast { transition: none; }
  }
`

export const ToastProvider = BaseToast.Provider
export const useToastManager = BaseToast.useToastManager

export type ToastProps = { toast: BaseToast.Root.ToastObject }

export function Toast({ toast }: ToastProps) {
  return (
    <BaseToast.Root toast={toast} className={styles.toast} swipeDirection={[]}>
      <BaseToast.Content>
        <BaseToast.Title className={styles.title} />
        <BaseToast.Description className={styles.description} />
        {toast.actionProps && <BaseToast.Action className={styles.action} />}
      </BaseToast.Content>
      <BaseToast.Close
        render={
          <Button className={styles.close} variant="ghost">
            <Icon name="close" size={12} />
          </Button>
        }
        aria-label="Dismiss notification"
      >
        <span aria-hidden="true">×</span>
      </BaseToast.Close>
    </BaseToast.Root>
  )
}

export function ToastViewport() {
  const { toasts } = useToastManager()

  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className={styles.viewport}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  )
}
