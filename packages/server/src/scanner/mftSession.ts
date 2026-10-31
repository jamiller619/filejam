import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import type { MessagePort } from 'node:worker_threads'

export type MftScanRequest = {
  root: string
  pipe: string
  journalId?: string
  nextUsn?: string
}

export type MftLaunchMessage = {
  type: 'mft-scan'
  request: MftScanRequest
  reply: MessagePort
}

function powershellLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function windowsArgument(value: string) {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

/** One elevation attempt per scanner lifetime, shared across its worker pool. */
export class MftHelperSession {
  readonly #helperPath: string
  readonly #workers: number
  #startup: Promise<Socket> | undefined
  #socket: Socket | undefined
  #server: Server | undefined
  #launcher: ReturnType<typeof spawn> | undefined
  #failure: Error | undefined
  #closed = false
  #rejectStartup: ((error: Error) => void) | undefined

  constructor(helperPath: string, workers: number) {
    this.#helperPath = helperPath
    this.#workers = Math.min(workers, 32)
  }

  async request(request: MftScanRequest) {
    if (this.#closed || this.#failure) {
      throw this.#failure ?? new Error('MFT helper session is closed')
    }

    // Retain rejected startup promises too: cancelling UAC must not prompt
    // again for every queued drive or filesystem watcher event.
    this.#startup ??= this.#start()
    const socket = await this.#startup

    if (this.#closed || this.#failure || socket.destroyed) {
      throw this.#failure ?? new Error('MFT helper session disconnected')
    }

    await new Promise<void>((resolve, reject) => {
      socket.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  #start(): Promise<Socket> {
    const pipe = `\\\\.\\pipe\\filejam-mft-session-${randomUUID()}`
    const token = randomUUID()

    return new Promise((resolve, reject) => {
      let ready = false
      const timeout = setTimeout(() => {
        fail(new Error('Timed out waiting for MFT helper elevation'))
      }, 90_000)
      const fail = (error: Error) => {
        clearTimeout(timeout)
        this.#failure ??= error
        this.#rejectStartup = undefined
        this.#socket?.destroy()

        if (this.#server?.listening) {
          this.#server.close()
        }

        this.#launcher?.kill()
        reject(error)
      }

      this.#rejectStartup = fail
      const server = createServer((socket) => {
        if (this.#socket || this.#closed || this.#failure) {
          socket.destroy()
          return
        }

        this.#socket = socket
        let handshake = ''
        socket.setEncoding('utf8')
        socket.on('error', fail)
        socket.once('close', () => {
          fail(new Error('MFT helper session disconnected; restart the app to retry'))
        })

        const receiveHandshake = (chunk: string) => {
          handshake += chunk

          if (handshake.length > 1024) {
            fail(new Error('Invalid MFT helper session handshake'))
            return
          }

          if (!handshake.includes('\n')) {
            return
          }

          try {
            const message = JSON.parse(handshake)

            if (message.type !== 'session-ready' || message.token !== token) {
              throw new Error('Invalid MFT helper session handshake')
            }
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)))
            return
          }

          ready = true
          clearTimeout(timeout)
          this.#rejectStartup = undefined
          socket.off('data', receiveHandshake)
          server.close()
          resolve(socket)
        }

        socket.on('data', receiveHandshake)
      })

      this.#server = server
      server.on('error', fail)
      server.listen(pipe, () => {
        if (this.#closed || this.#failure) {
          fail(new Error('MFT helper session is closed'))
          return
        }

        const args = [
          '--session', pipe,
          '--token', token,
          '--workers', String(this.#workers),
        ]
        const command = [
          "$ErrorActionPreference = 'Stop';",
          `Start-Process -FilePath ${powershellLiteral(this.#helperPath)}`,
          `-ArgumentList ${powershellLiteral(args.map(windowsArgument).join(' '))}`,
          '-Verb RunAs -WindowStyle Hidden',
        ].join(' ')

        this.#launcher = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-WindowStyle',
            'Hidden',
            '-Command',
            command,
          ],
          { stdio: 'ignore', windowsHide: true },
        )
        this.#launcher.once('error', fail)
        this.#launcher.once('exit', (code) => {
          if (!ready && code !== 0) {
            fail(new Error(`MFT helper elevation failed or was declined (${code})`))
          }
        })
      })
    })
  }

  close() {
    this.#closed = true
    this.#rejectStartup?.(new Error('MFT helper session is closed'))
    this.#socket?.destroy()
    this.#launcher?.kill()

    if (this.#server?.listening) {
      this.#server.close()
    }
  }
}
