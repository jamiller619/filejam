import type { IpcMainInvokeEvent, WebContents } from 'electron'

export type IpcMiddleware = (
  event: IpcMainInvokeEvent,
  next: () => Promise<unknown>,
) => unknown

/** Run middleware in order before invoking the handler. */
export function withIpcMiddleware<Args extends unknown[], Result>(
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ...middleware: IpcMiddleware[]
) {
  return async (event: IpcMainInvokeEvent, ...args: Args): Promise<unknown> => {
    let lastIndex = -1
    async function dispatch(index: number): Promise<unknown> {
      if (index <= lastIndex)
        throw new Error('IPC next() called more than once')
      lastIndex = index
      const current = middleware[index]
      if (current) return current(event, () => dispatch(index + 1))
      return handler(event, ...args)
    }
    return dispatch(0)
  }
}

/** Permit requests only from the owning window's main frame. */
export function authorizeRenderer(renderer: WebContents): IpcMiddleware {
  return (event, next) => {
    if (event.sender !== renderer || event.senderFrame !== renderer.mainFrame) {
      throw new Error('Unauthorized IPC request')
    }
    return next()
  }
}
