import { spawn } from 'node:child_process'
import { toNamespacedPath } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { shellPath } from '../utils/shellPath.js'
import type { NativeTrashOutcome, NativeTrashReference } from './types.js'

/** One native worker gives all platforms atomic moves that never replace targets. */
export class NativeMoves {
  #child: ReturnType<typeof spawn> | undefined
  #reply:
    | { resolve: (value: unknown) => void; reject: (error: Error) => void }
    | undefined

  async move(source: string, target: string) {
    await this.request({
      type: 'move',
      source: toNamespacedPath(source),
      target: toNamespacedPath(target),
    })
  }

  async trashSnapshot(sources: string[]) {
    return this.request({ type: 'trashSnapshot', sources }) as Promise<string[]>
  }

  async trash(sources: string[], before: string[]) {
    return this.request({ type: 'trash', sources, before }) as Promise<
      NativeTrashOutcome[]
    >
  }

  async findTrash(sources: string[], before: string[]) {
    return this.request({ type: 'findTrash', sources, before }) as Promise<
      NativeTrashOutcome[]
    >
  }

  async restoreTrash(reference: NativeTrashReference) {
    await this.request({
      type: 'restoreTrash',
      reference: {
        ...reference,
        originalParent: shellPath(reference.originalParent),
      },
    })
  }

  async request(payload: unknown): Promise<unknown> {
    if (!this.#child) {
      const executable = fileURLToPath(
        new URL(
          `../../../../packages/fs-service/target/release/filejam-fs-service${process.platform === 'win32' ? '.exe' : ''}`,
          import.meta.url,
        ),
      )
      const child = spawn(executable, ['--operations'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      this.#child = child
      const fail = (error: Error) => {
        if (this.#child !== child) {
          return
        }

        this.#reply?.reject(error)
        this.#reply = undefined
        this.#child = undefined
      }

      child.once('error', fail)
      child.once('exit', () =>
        fail(
          new Error(
            'Native file operation worker exited. Inspect the operation paths before retrying.',
          ),
        ),
      )
      child.stdin.on('error', fail)
      createInterface({ input: child.stdout }).on('line', (line) => {
        const reply = this.#reply
        this.#reply = undefined

        try {
          const result = JSON.parse(line) as {
            ok: boolean
            data?: unknown
            error?: string
            code?: string
          }

          if (result.ok) {
            reply?.resolve(result.data)
          } else {
            reply?.reject(
              Object.assign(new Error(result.error), { code: result.code }),
            )
          }
        } catch (error) {
          reply?.reject(
            error instanceof Error ? error : new Error(String(error)),
          )
        }
      })
    }

    if (this.#reply) {
      throw new Error('Native file operations must be serialized.')
    }

    return new Promise<unknown>((resolve, reject) => {
      this.#reply = { resolve, reject }
      this.#child?.stdin?.write(`${JSON.stringify(payload)}\n`)
    })
  }

  close() {
    this.#child?.stdin?.end()
  }
}
