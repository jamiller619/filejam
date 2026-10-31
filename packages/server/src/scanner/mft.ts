import { randomUUID } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import { MessageChannel, parentPort } from 'node:worker_threads'
import type { MftLaunchMessage, MftScanRequest } from './mftSession.js'

export type MftEntry = {
  path: string
  directory: boolean
  deleted: boolean
  size: number
  modifiedAt: number
  createdAt: number
  missing: boolean
  metadataError?: string
}

export type MftCheckpoint = {
  journalId: string
  nextUsn: string
}

export type MftResult = {
  mode: 'full' | 'incremental'
  checkpoint: MftCheckpoint
}

export type MftMessage =
  | {
      type: 'ready'
      total: number
      mode: MftResult['mode']
      journalId: string
      nextUsn: string
    }
  | { type: 'batch'; entries: MftEntry[] }
  | { type: 'complete' }
  | { type: 'error'; error: string }

const helperConnectionTimeoutMs = 120_000

export function canEnumerateMft(
  root: string,
  scanPath: string,
  helperPath: string | undefined,
) {
  return (
    process.platform === 'win32' &&
    helperPath !== undefined &&
    resolve(root) === resolve(scanPath) &&
    /^[a-z]:[\\/]/i.test(root)
  )
}

/**
 * Streams parent-first paths from the elevated native helper. The helper keeps
 * only directory relationships in memory and performs a second fast MFT pass
 * for files, so neither process materializes the complete file tree.
 */
export async function enumerateMft(
  root: string,
  helperPath: string,
  consume: (entries: MftEntry[]) => Promise<void>,
  isCancelled: () => boolean,
  setTotal: (total: number) => void,
  checkpoint?: MftCheckpoint,
): Promise<MftResult> {
  const pipePath = `\\\\.\\pipe\\filejam-mft-${process.pid}-${randomUUID()}`
  let socket: Socket | undefined

  const server = createServer()
  const connection = waitForConnection(server, isCancelled)

  try {
    if (!helperPath) {
      throw new Error('MFT helper is unavailable')
    }

    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('error', rejectListening)
      server.listen(pipePath, resolveListening)
    })

    const launch = requestMftScan(
      { root, pipe: pipePath, ...checkpoint },
      isCancelled,
    )
    const [connectedSocket] = await Promise.all([connection.socket, launch])

    socket = connectedSocket

    const lines = createInterface({ input: socket, crlfDelay: Infinity })
    let ready = false
    let complete = false
    let result: MftResult | undefined

    for await (const line of lines) {
      if (isCancelled()) {
        break
      }

      const message = parseMftMessage(line)

      switch (message.type) {
        case 'ready':
          ready = true
          result = {
            mode: message.mode,
            checkpoint: {
              journalId: message.journalId,
              nextUsn: message.nextUsn,
            },
          }
          setTotal(message.total)
          break
        case 'batch':
          if (!ready) {
            throw new Error('MFT helper sent entries before its ready message')
          }

          await consume(
            message.entries.map((entry) => ({
              ...entry,
              path: safeEntryPath(root, entry.path),
            })),
          )
          break
        case 'complete':
          complete = true
          break
        case 'error':
          throw new Error(`MFT enumeration failed: ${message.error}`)
      }
    }

    if (!isCancelled() && !complete) {
      throw new Error('MFT helper disconnected before completing enumeration')
    }

    if (!result) {
      throw new Error('MFT helper completed without scan metadata')
    }

    return result
  } finally {
    connection.dispose()
    socket?.destroy()
    await closeServer(server)
  }
}

function requestMftScan(request: MftScanRequest, isCancelled: () => boolean) {
  return new Promise<void>((resolveLaunch, rejectLaunch) => {
    if (!parentPort) {
      rejectLaunch(new Error('MFT scans require the scanner session owner'))
      return
    }

    const { port1, port2 } = new MessageChannel()
    const cancelPoll = setInterval(() => {
      if (isCancelled()) {
        finish(new Error('MFT enumeration was cancelled'))
      }
    }, 100)
    const timeout = setTimeout(() => {
      finish(new Error('Timed out requesting the MFT helper'))
    }, helperConnectionTimeoutMs)
    const finish = (error?: Error) => {
      clearInterval(cancelPoll)
      clearTimeout(timeout)
      port1.close()

      if (error) {
        rejectLaunch(error)
      } else {
        resolveLaunch()
      }
    }

    port1.once('message', (message: { error?: string }) => {
      finish(message.error ? new Error(message.error) : undefined)
    })

    try {
      parentPort.postMessage(
        { type: 'mft-scan', request, reply: port2 } satisfies MftLaunchMessage,
        [port2],
      )
    } catch (error) {
      port2.close()
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function waitForConnection(server: Server, isCancelled: () => boolean) {
  let settled = false
  let timeout: ReturnType<typeof setTimeout>
  let cancelPoll: ReturnType<typeof setInterval>
  let connected: Socket | undefined
  const dispose = () => {
    settled = true
    clearTimeout(timeout)
    clearInterval(cancelPoll)
    connected?.destroy()
  }

  const socket = new Promise<Socket>((resolveConnection, rejectConnection) => {
    cancelPoll = setInterval(() => {
      if (isCancelled()) {
        dispose()
        rejectConnection(new Error('MFT enumeration was cancelled'))
      }
    }, 100)

    timeout = setTimeout(() => {
      dispose()
      rejectConnection(new Error('Timed out waiting for the MFT helper'))
    }, helperConnectionTimeoutMs)

    server.once('error', (error) => {
      dispose()
      rejectConnection(error)
    })

    server.once('connection', (connection) => {
      if (settled) {
        connection.destroy()
        return
      }

      settled = true
      connected = connection
      connection.once('error', (error) => {
        dispose()
        rejectConnection(error)
      })
      clearTimeout(timeout)
      // Keep polling cancellation while the helper enumerates before its first
      // batch. Closing this scan pipe leaves the shared elevated session alive.
      resolveConnection(connection)
    })
  })

  // Listening itself can fail before the caller reaches Promise.all.
  void socket.catch(() => {})

  return { socket, dispose }
}

function closeServer(server: Server) {
  if (!server.listening) {
    return Promise.resolve()
  }

  return new Promise<void>((resolveClose) => {
    server.close(() => resolveClose())
  })
}

export function parseMftMessage(line: string): MftMessage {
  let value: unknown

  try {
    value = JSON.parse(line)
  } catch {
    throw new Error('MFT helper returned invalid JSON')
  }

  if (!value || typeof value !== 'object' || !('type' in value)) {
    throw new Error('MFT helper returned an invalid message')
  }

  const message = value as Record<string, unknown>

  if (
    message.type === 'ready' &&
    typeof message.total === 'number' &&
    Number.isSafeInteger(message.total) &&
    message.total >= 0 &&
    (message.mode === 'full' || message.mode === 'incremental') &&
    typeof message.journalId === 'string' &&
    /^\d+$/.test(message.journalId) &&
    typeof message.nextUsn === 'string' &&
    /^\d+$/.test(message.nextUsn)
  ) {
    return {
      type: 'ready',
      total: message.total,
      mode: message.mode,
      journalId: message.journalId,
      nextUsn: message.nextUsn,
    }
  }

  if (message.type === 'complete') {
    return { type: 'complete' }
  }

  if (message.type === 'error' && typeof message.error === 'string') {
    return { type: 'error', error: message.error }
  }

  if (
    message.type === 'batch' &&
    Array.isArray(message.entries) &&
    message.entries.length <= 512 &&
    message.entries.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        'path' in entry &&
        typeof entry.path === 'string' &&
        'directory' in entry &&
        typeof entry.directory === 'boolean' &&
        'deleted' in entry &&
        typeof entry.deleted === 'boolean' &&
        'size' in entry &&
        typeof entry.size === 'number' &&
        Number.isSafeInteger(entry.size) &&
        entry.size >= 0 &&
        'modifiedAt' in entry &&
        typeof entry.modifiedAt === 'number' &&
        Number.isSafeInteger(entry.modifiedAt) &&
        'createdAt' in entry &&
        typeof entry.createdAt === 'number' &&
        Number.isSafeInteger(entry.createdAt) &&
        'missing' in entry &&
        typeof entry.missing === 'boolean' &&
        (!('metadataError' in entry) ||
          typeof entry.metadataError === 'string'),
    )
  ) {
    return { type: 'batch', entries: message.entries as MftEntry[] }
  }

  throw new Error('MFT helper returned an invalid message')
}

function safeEntryPath(root: string, path: string) {
  if (!path || path.includes('\0') || isAbsolute(path)) {
    throw new Error('MFT helper returned an invalid relative path')
  }

  const absolutePath = resolve(root, path)
  const relation = relative(root, absolutePath)

  if (
    relation === '..' ||
    relation.startsWith(`..${sep}`) ||
    isAbsolute(relation)
  ) {
    throw new Error('MFT helper returned a path outside the scan root')
  }

  return absolutePath
}
