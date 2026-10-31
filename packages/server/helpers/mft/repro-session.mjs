// Disposable UAC reproduction. Run from normal PowerShell after rebuilding:
// node repro-session.mjs <path-to-filejam-mft.exe>
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const executable = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('./bin/filejam-mft.exe', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'filejam session repro '))
const sessionPipe = `\\\\.\\pipe\\filejam-mft-session-${randomUUID()}`
const token = randomUUID()
const server = createServer()
let control
let launcher
let timeout
let scanSocket
let scanServer

function powershellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function windowsArgument(value) {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

async function listen(server, pipe) {
  await new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(pipe, resolveListening)
  })
}

async function scan(number) {
  const pipe = `\\\\.\\pipe\\filejam-mft-${process.pid}-${randomUUID()}`
  let scanTimeout

  scanServer = createServer()
  const received = new Promise((resolveScan, reject) => {
    scanTimeout = setTimeout(() => {
      reject(new Error(`Scan ${number} timed out`))
    }, 120_000)
    scanServer.once('connection', async (socket) => {
      scanSocket = socket
      socket.on('error', reject)
      let ready = false
      let complete = false
      const paths = []

      try {
        for await (const line of createInterface({ input: socket })) {
          console.log(`Scan ${number}: ${line}`)
          const message = JSON.parse(line)

          if (message.type === 'error') {
            throw new Error(message.error)
          }

          if (message.type === 'ready') {
            assert.equal(message.total, 2)
            ready = true
          } else if (message.type === 'batch') {
            assert(ready)

            for (const entry of message.entries) {
              assert(!entry.metadataError && !entry.missing)
              assert.equal(entry.size, 6)
              paths.push(entry.path)
            }
          } else if (message.type === 'complete') {
            complete = true
          }
        }

        assert(ready && complete)
        assert.deepEqual(paths, ['hello.txt'])
        resolveScan()
      } catch (error) {
        reject(error)
      }
    })
  })

  void received.catch(() => {})

  try {
    await listen(scanServer, pipe)
    control.write(`${JSON.stringify({ root, pipe })}\n`)
    await received
  } finally {
    clearTimeout(scanTimeout)
    scanSocket?.destroy()

    if (scanServer.listening) {
      scanServer.close()
    }
  }
}

try {
  await writeFile(join(root, 'hello.txt'), 'hello\n')
  await listen(server, sessionPipe)

  const session = new Promise((resolveSession, reject) => {
    timeout = setTimeout(() => reject(new Error('Session reproduction timed out')), 120_000)
    server.once('connection', (socket) => {
      control = socket
      socket.on('error', reject)
      const lines = createInterface({ input: socket })

      lines.once('line', (line) => {
        try {
          const message = JSON.parse(line)

          assert.equal(message.type, 'session-ready')
          assert.equal(message.token, token)
          lines.close()
          resolveSession()
        } catch (error) {
          reject(error)
        }
      })
    })

    const args = ['--session', sessionPipe, '--token', token, '--workers', '1']
    const command = [
      "$ErrorActionPreference = 'Stop';",
      `$helper = Start-Process -FilePath ${powershellLiteral(executable)}`,
      `-ArgumentList ${powershellLiteral(args.map(windowsArgument).join(' '))}`,
      '-Verb RunAs -WindowStyle Hidden -PassThru;',
      '$helper.WaitForExit(); exit $helper.ExitCode',
    ].join(' ')

    console.log('Accept one UAC prompt. Both scans will use that helper.')
    launcher = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: 'inherit',
      windowsHide: true,
    })
    launcher.once('error', reject)
    launcher.once('exit', (code) => {
      reject(new Error(`Helper exited before connecting (${code})`))
    })
  })

  await session
  clearTimeout(timeout)
  console.log('Elevated session connected')
  await scan(1)
  await scan(2)
  console.log('PASS: two scans completed through one elevated helper')
} finally {
  clearTimeout(timeout)
  scanSocket?.destroy()

  if (scanServer?.listening) {
    scanServer.close()
  }

  control?.destroy()
  server.close()
  launcher?.kill()
  await rm(root, { recursive: true, force: true })
}
