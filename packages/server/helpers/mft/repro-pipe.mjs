// Temporary helper-only reproduction. Delete once the helper is fixed.
// Run from a normal (non-Administrator) terminal after building bin/filejam-mft.exe:
// node repro-pipe.mjs [scan-root] [helper-executable]
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const executable = process.argv[3]
  ? resolve(process.argv[3])
  : fileURLToPath(new URL('./bin/filejam-mft.exe', import.meta.url))
const workspace = await mkdtemp(join(tmpdir(), 'filejam-mft-repro-'))
const fixture = !process.argv[2]
const root = fixture ? join(workspace, 'scan root') : resolve(process.argv[2])
const pipe = `\\\\.\\pipe\\filejam-mft-repro-${randomUUID()}`
const server = createServer()
let helper
let socket
let timeout
let disconnectTimeout

function powershellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function windowsArgument(value) {
  // Escape embedded quotes and double trailing backslashes before closing quotes.
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

try {
  if (fixture) {
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'hello.txt'), 'hello\n')
    await writeFile(join(root, 'nested', 'world.txt'), 'hello\n')
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(pipe, resolve)
  })

  console.log(`Executable: ${executable}\nRoot: ${root}\nPipe: ${pipe}`)

  const messages = new Promise((resolve, reject) => {
    server.once('error', reject)
    timeout = setTimeout(() => reject(new Error('Helper timed out after 120s')), 120_000)
    // The helper currently reconnects to report errors after closing its scan pipe.
    server.on('connection', async (connection) => {
      clearTimeout(disconnectTimeout)
      socket = connection
      socket.on('error', reject)
      console.log('Helper connected')

      const expected = new Map([
        ['nested', true],
        ['hello.txt', false],
        [join('nested', 'world.txt'), false],
      ])
      let ready = false
      let complete = false
      let entries = 0
      let batches = 0
      let metadataErrors = 0

      try {
        for await (const line of createInterface({ input: socket, crlfDelay: Infinity })) {
          const message = JSON.parse(line)

          if (fixture || message.type !== 'batch') {
            console.log(line)
          }

          assert(!complete, 'Message received after complete')

          switch (message.type) {
            case 'ready':
              assert(!ready, 'Duplicate ready message')
              assert.equal(message.mode, 'full')
              if (fixture) {
                assert.equal(message.total, 4)
              }

              ready = true
              break
            case 'batch':
              assert(ready, 'Batch received before ready')
              entries += message.entries.length
              batches++

              if (!fixture) {
                metadataErrors += message.entries.filter((entry) => entry.metadataError).length

                if (batches === 1 || batches % 100 === 0) {
                  console.log(`Received ${batches} batches, ${entries} entries, ${metadataErrors} metadata errors`)
                }

                break
              }

              for (const entry of message.entries) {
                assert(expected.has(entry.path), `Unexpected entry: ${entry.path}`)
                assert.equal(entry.directory, expected.get(entry.path))
                assert(!entry.missing && !entry.deleted && !entry.metadataError)
                assert(entry.modifiedAt > 0 && entry.createdAt > 0)

                if (!entry.directory) {
                  assert.equal(entry.size, 6)
                }

                expected.delete(entry.path)
              }

              break
            case 'complete':
              complete = true
              break
            default:
              throw new Error(`Unexpected helper message: ${line}`)
          }
        }

        if (!complete) {
          console.log(`Pipe disconnected: ready=${ready}, entries=${entries}; waiting briefly for an error connection`)
          disconnectTimeout = setTimeout(
            () => reject(new Error('Helper disconnected without completing')),
            2000,
          )
          return
        }

        assert(ready, 'Helper completed without ready')

        if (fixture) {
          assert.equal(expected.size, 0, 'Missing fixture entries')
        }

        console.log(`Completed: ${entries} entries, ${metadataErrors} metadata errors`)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })

  // Start-Process joins argument arrays into a command line. Preserve quotes
  // around each argument so the helper receives the space-containing root intact.
  const argumentList = ['--root', root, '--pipe', pipe]
    .map(windowsArgument)
    .join(' ')
  const command = [
    '$ErrorActionPreference = \'Stop\';',
    `Start-Process -FilePath ${powershellLiteral(executable)}`,
    `-ArgumentList ${powershellLiteral(argumentList)}`,
    '-Verb RunAs',
    '-WindowStyle Hidden',
  ].join(' ')

  console.log('Requesting elevation. Accept the Windows UAC prompt.')
  helper = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
    { stdio: 'inherit', windowsHide: true },
  )
  const exited = new Promise((resolve, reject) => {
    helper.once('error', reject)
    helper.once('exit', (code, signal) => {
      console.log(`PowerShell launcher exited: code=${code}, signal=${signal}`)

      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Elevation launcher failed: code=${code}, signal=${signal}`))
      }
    })
  })

  await Promise.all([messages, exited])
  console.log('PASS: elevated helper completed the scan over the named pipe')
} finally {
  clearTimeout(timeout)
  clearTimeout(disconnectTimeout)
  socket?.destroy()
  helper?.kill()
  server.close()
  await rm(workspace, { recursive: true, force: true })
}
