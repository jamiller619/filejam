import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'

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

const helperConnectionTimeoutMs = 10_000
const elevatedHelperConnectionTimeoutMs = 60_000

function powershellLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function elevatedHelperCommand(helperPath: string, args: string[]) {
  const argumentList = args.map(powershellLiteral).join(', ')

  return [
    `Start-Process -FilePath ${powershellLiteral(helperPath)}`,
    `-ArgumentList @(${argumentList})`,
    '-Verb RunAs',
    '-WindowStyle Hidden',
  ].join(' ')
}

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
  let helper: ReturnType<typeof spawn> | undefined
  const server = createServer()

  try {
    const connection = waitForConnection(server, isCancelled)

    await new Promise<void>((resolveListening, rejectListening) => {
      server.once('error', rejectListening)
      server.listen(pipePath, resolveListening)
    })

    const helperArgs = [
      '--root',
      root,
      '--pipe',
      pipePath,
      ...(checkpoint
        ? [
            '--journal-id',
            checkpoint.journalId,
            '--next-usn',
            checkpoint.nextUsn,
          ]
        : []),
    ]

    helper = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        elevatedHelperCommand(helperPath, helperArgs),
      ],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    )

    const launchError = new Promise<never>((_resolve, reject) => {
      helper?.once('error', reject)
    })

    // PowerShell exits once Windows accepts the RunAs request. Allow time for
    // the user to approve UAC and for the elevated helper to connect.
    helper.once('exit', (code) => {
      if (code === 0) {
        connection.waitForElevation()
      }
    })

    socket = await Promise.race([connection.socket, launchError])

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
    socket?.destroy()
    helper?.kill()
    await closeServer(server)
  }
}

function waitForConnection(server: Server, isCancelled: () => boolean) {
  let settled = false
  let waitingForElevation = false
  let timeout: ReturnType<typeof setTimeout>
  let waitForElevation = () => {}

  const socket = new Promise<Socket>((resolveConnection, rejectConnection) => {
    const rejectAfter = (duration: number, message: string) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        settled = true
        clearInterval(cancelPoll)
        rejectConnection(new Error(message))
      }, duration)
    }
    const cancelPoll = setInterval(() => {
      if (isCancelled()) {
        settled = true
        clearTimeout(timeout)
        clearInterval(cancelPoll)
        rejectConnection(new Error('MFT enumeration was cancelled'))
      }
    }, 100)

    rejectAfter(
      helperConnectionTimeoutMs,
      'Timed out waiting for the MFT helper',
    )

    server.once('error', (error) => {
      settled = true
      clearTimeout(timeout)
      clearInterval(cancelPoll)
      rejectConnection(error)
    })

    server.once('connection', (connection) => {
      settled = true
      clearTimeout(timeout)
      clearInterval(cancelPoll)
      resolveConnection(connection)
    })

    waitForElevation = () => {
      if (settled || waitingForElevation) {
        return
      }

      waitingForElevation = true
      rejectAfter(
        elevatedHelperConnectionTimeoutMs,
        'Timed out waiting for the elevated MFT helper',
      )
    }
  })

  return { socket, waitForElevation: () => waitForElevation() }
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
