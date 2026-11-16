import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const binary = fileURLToPath(
  new URL(
    '../../../packages/fs-service/target/release/filejam-fs-service' +
      (process.platform === 'win32' ? '.exe' : ''),
    import.meta.url,
  ),
)
const options = {
  nameContains: '',
  kind: 'all',
  sortDirection: 'asc',
}

function startService() {
  const child = spawn(binary, [], {
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const events = []
  const waiters = []
  let diagnostics = ''
  let failure = null

  child.stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-4096)
  })

  function rejectWaiters(error) {
    failure ??= error

    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(failure)
    }
  }

  child.on('error', rejectWaiters)
  child.stdin.on('error', rejectWaiters)
  child.stdout.on('error', rejectWaiters)
  const lines = createInterface({ input: child.stdout })

  lines.on('line', (line) => {
    try {
      const event = JSON.parse(line)
      const waiter = waiters.shift()

      if (waiter) {
        clearTimeout(waiter.timer)
        waiter.resolve(event)
      } else {
        events.push(event)
      }
    } catch (error) {
      rejectWaiters(error)
    }
  })

  const exited = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      rejectWaiters(
        new Error(`Service closed ${code}/${signal}: ${diagnostics}`),
      )
      resolve({ code, signal })
    })
  })

  return {
    child,
    send(value) {
      child.stdin.write(`${JSON.stringify(value)}\n`)
    },
    sendChunks(value, splitAt) {
      const line = `${JSON.stringify(value)}\n`
      child.stdin.write(line.slice(0, splitAt))
      child.stdin.write(line.slice(splitAt))
    },
    nextEvent() {
      if (events.length) {
        return Promise.resolve(events.shift())
      }

      if (failure) {
        return Promise.reject(failure)
      }

      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null }
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter)

          if (index !== -1) {
            waiters.splice(index, 1)
          }

          reject(
            new Error(`Timed out waiting for service event: ${diagnostics}`),
          )
        }, 5000)
        waiters.push(waiter)
      })
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.stdin.end(`${JSON.stringify({ v: 1, type: 'shutdown' })}\n`)
      }

      const killTimer = setTimeout(() => child.kill(), 2000)
      let exitTimer

      try {
        const exit = await Promise.race([
          exited,
          new Promise((_, reject) => {
            exitTimer = setTimeout(
              () => reject(new Error('Service failed to exit')),
              5000,
            )
          }),
        ])
        return exit
      } finally {
        clearTimeout(killTimer)
        clearTimeout(exitTimer)
        lines.close()
      }
    },
  }
}

async function withService(run) {
  const service = startService()
  const deadline = setTimeout(() => service.child.kill(), 15000)

  try {
    assert.deepEqual(await service.nextEvent(), { v: 1, type: 'ready' })
    await run(service)
  } finally {
    clearTimeout(deadline)
    const exit = await service.stop()
    assert.equal(exit.code, 0, 'Service should exit cleanly')
  }
}

async function withDirectory(run) {
  const root = await mkdtemp(join(tmpdir(), 'filejam-desktop-service-'))

  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function listCommand(id, path) {
  return { v: 1, type: 'list', id, path, options }
}

async function finishView(service, id, expectedTotal) {
  const listing = await service.nextEvent()
  assert.equal(listing.type, 'listing', JSON.stringify(listing))
  assert.equal(listing.id, id)
  assert.equal(listing.total, expectedTotal)

  const entries = []

  while (entries.length < expectedTotal) {
    service.send({ v: 1, type: 'next', id })
    const batch = await service.nextEvent()
    assert.equal(batch.type, 'batch', JSON.stringify(batch))
    assert.equal(batch.offset, entries.length)
    entries.push(...batch.entries)
  }

  assert.deepEqual(await service.nextEvent(), {
    v: 1,
    type: 'done',
    id,
    total: expectedTotal,
  })
  return entries
}

test('enumerates 10000 unique entries with the exact count', {
  timeout: 20000,
}, async () => {
  await withDirectory(async (root) => {
    for (let index = 0; index < 10000; index += 1) {
      await writeFile(
        join(root, `entry-${String(index).padStart(5, '0')}.txt`),
        '',
      )
    }

    await withService(async (service) => {
      service.send(listCommand('ten-thousand', root))
      const entries = await finishView(service, 'ten-thousand', 10000)
      assert.equal(entries.length, 10000)
      assert.equal(new Set(entries.map((entry) => entry.path)).size, 10000)
    })
  })
})

test('accepts one JSON command split across stdin chunks', {
  timeout: 15000,
}, async () => {
  await withDirectory(async (root) => {
    await writeFile(join(root, 'split.txt'), '')

    await withService(async (service) => {
      const command = listCommand('split-input', root)
      service.sendChunks(
        command,
        Math.floor(JSON.stringify(command).length / 2),
      )
      const entries = await finishView(service, 'split-input', 1)
      assert.deepEqual(
        entries.map((entry) => entry.name),
        ['split.txt'],
      )
    })
  })
})

test('rejects invalid versions and oversized input lines', {
  timeout: 20000,
}, async (context) => {
  for (const [label, input] of [
    ['invalid-version', `${JSON.stringify({ v: 2, type: 'shutdown' })}\n`],
    ['oversized-line', `${' '.repeat(1048577)}\n`],
  ]) {
    await context.test(label, async () => {
      const service = startService()
      const deadline = setTimeout(() => service.child.kill(), 15000)
      let closeTimer

      try {
        assert.deepEqual(await service.nextEvent(), { v: 1, type: 'ready' })
        service.child.stdin.end(input)
        const exit = await Promise.race([
          new Promise((resolve) =>
            service.child.once('close', (code, signal) =>
              resolve({ code, signal }),
            ),
          ),
          new Promise(
            (_, reject) =>
              (closeTimer = setTimeout(
                () => reject(new Error('Fatal input did not close service')),
                5000,
              )),
          ),
        ])
        assert.notEqual(exit.code, 0)
      } finally {
        clearTimeout(deadline)
        clearTimeout(closeTimer)
        if (
          service.child.exitCode === null &&
          service.child.signalCode === null
        ) {
          service.child.kill()
        }
      }
    })
  }
})

test('rapid A/B/C list cancellation leaves later views usable', {
  timeout: 15000,
}, async () => {
  await withDirectory(async (root) => {
    const directoryA = join(root, 'A')
    const directoryB = join(root, 'B')
    const directoryC = join(root, 'C')
    await Promise.all([mkdir(directoryA), mkdir(directoryB), mkdir(directoryC)])
    await writeFile(join(directoryA, 'a.txt'), '')
    await writeFile(join(directoryB, 'b.txt'), '')
    await writeFile(join(directoryC, 'c.txt'), '')

    await withService(async (service) => {
      service.send(listCommand('A', directoryA))
      assert.equal((await service.nextEvent()).type, 'listing')
      service.send({ v: 1, type: 'cancel', id: 'A' })
      assert.deepEqual(await service.nextEvent(), {
        v: 1,
        type: 'cancelled',
        id: 'A',
      })

      service.send(listCommand('B', directoryB))
      assert.deepEqual(
        (await finishView(service, 'B', 1)).map((entry) => entry.name),
        ['b.txt'],
      )
      service.send(listCommand('C', directoryC))
      assert.deepEqual(
        (await finishView(service, 'C', 1)).map((entry) => entry.name),
        ['c.txt'],
      )
    })
  })
})
