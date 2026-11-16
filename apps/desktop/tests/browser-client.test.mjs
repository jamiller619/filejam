import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { BrowserClient } from '../dist/browser/client.js'

function fakeChild() {
  const child = new EventEmitter()
  child.pid = 123
  child.exitCode = null
  child.signalCode = null
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.killCount = 0
  child.kill = () => {
    child.killCount += 1
    child.signalCode = 'SIGKILL'
    child.emit('exit', null, 'SIGTERM')
  }
  child.ready = () => child.stdout.write('{"v":1,"type":"ready"}\n')
  return child
}

test('main timings use one clock, preserve service durations, and reset for empty listings', async () => {
  const child = fakeChild()
  let now = 100
  const client = new BrowserClient('service', {
    spawn: () => child,
    now: () => now,
    closeTimeoutMs: 1,
  })
  const starting = client.start()
  child.ready()
  await starting
  const options = { kind: 'all', nameContains: '', sortDirection: 'asc' }
  const id = client.list('C:\\one', options, () => {})
  const emit = (event) =>
    child.stdout.write(`${JSON.stringify({ v: 1, id, ...event })}\n`)
  now = 110
  emit({
    type: 'listing',
    path: 'C:\\one',
    parentPath: 'C:\\',
    total: 1,
    metrics: { enumerationMs: 999, filterSortMs: 888 },
  })
  client.next(id)
  now = 115
  emit({
    type: 'batch',
    offset: 0,
    entries: [{ name: 'a', path: 'C:\\one\\a', kind: 'file' }],
  })
  now = 120
  emit({ type: 'done', total: 1 })
  assert.deepEqual(client.lastMeasurement, {
    id,
    startedAt: 100,
    listingMs: 10,
    firstBatchMs: 15,
    doneMs: 20,
    service: { enumerationMs: 999, filterSortMs: 888 },
  })
  const copy = client.lastMeasurement
  copy.service.enumerationMs = 0
  assert.equal(client.lastMeasurement.service.enumerationMs, 999)
  now = 200
  const empty = client.list('C:\\empty', options, () => {})
  assert.equal(client.lastMeasurement.firstBatchMs, null)
  child.stdout.write(
    `${JSON.stringify({ v: 1, id: empty, type: 'listing', path: 'C:\\empty', parentPath: 'C:\\', total: 0, metrics: { enumerationMs: 1, filterSortMs: 2 } })}\n`,
  )
  now = 205
  child.stdout.write(
    `${JSON.stringify({ v: 1, id: empty, type: 'done', total: 0 })}\n`,
  )
  assert.equal(client.lastMeasurement.doneMs, 5)
  assert.equal(client.lastMeasurement.firstBatchMs, null)
  await client.close()
})

test('waits for ready and closes idempotently', async () => {
  const child = fakeChild()
  const client = new BrowserClient('trusted.exe', { spawn: () => child })
  const starting = client.start()
  assert.equal(client.pid, 123)
  child.ready()
  await starting
  child.stdin.once('data', () => {
    child.exitCode = 0
    child.emit('exit', 0, null)
  })
  const first = client.close()
  assert.equal(client.close(), first)
  await first
  assert.equal(child.killCount, 0)
})

test('missing executable rejects with build instruction', async () => {
  const client = new BrowserClient('missing.exe', {
    spawn: () => {
      const error = new Error('missing')
      error.code = 'ENOENT'
      throw error
    },
  })
  await assert.rejects(client.start(), /pnpm poc:service:build/)
})

test('never-ready child rejects and is terminated', async () => {
  const child = fakeChild()
  const client = new BrowserClient('service', {
    spawn: () => child,
    readyTimeoutMs: 5,
  })
  await assert.rejects(client.start(), /did not become ready/)
  assert.equal(child.killCount, 1)
  assert.equal(child.listenerCount('exit'), 0)
  assert.equal(child.stdout.listenerCount('data'), 0)
})

test('duplicate ready after startup makes the session unavailable', async () => {
  const child = fakeChild()
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.ready()
  await starting
  child.ready()
  assert.equal(child.killCount, 1)
  await assert.rejects(client.start(), /unavailable/)
  await client.close()
})

test('close before ready settles startup and does not restart', async () => {
  const child = fakeChild()
  const client = new BrowserClient('service', {
    spawn: () => child,
    closeTimeoutMs: 5,
  })
  const rejected = assert.rejects(client.start(), /closed before ready/)
  await client.close()
  await rejected
  assert.equal(child.killCount, 1)
  await assert.rejects(client.start(), /unavailable/)
})

test('closing before start does not spawn a process', async () => {
  const client = new BrowserClient('service', {
    spawn: () => assert.fail('must not spawn'),
  })
  const closed = client.close()
  assert.equal(client.close(), closed)
  await closed
  await assert.rejects(client.start(), /unavailable/)
})

test('pipe errors and incomplete stdout settle startup and clean listeners', async () => {
  for (const trigger of [
    (child) => child.stdin.emit('error', new Error('broken pipe')),
    (child) => child.stdout.end('{'),
  ]) {
    const child = fakeChild()
    const client = new BrowserClient('service', { spawn: () => child })
    const rejected = assert.rejects(client.start())
    trigger(child)
    await rejected
    await client.close()
    assert.equal(child.killCount, 1)
    assert.equal(child.listenerCount('exit'), 0)
    assert.equal(child.stdout.listenerCount('data'), 0)
  }
})

test('duplicate ready and malformed output fail the session', async () => {
  for (const output of [
    '{"v":1,"type":"ready"}\n{"v":1,"type":"ready"}\n',
    '{bad}\n',
  ]) {
    const child = fakeChild()
    const client = new BrowserClient('service', { spawn: () => child })
    const starting = client.start()
    child.stdout.write(output)
    await assert.rejects(starting)
    assert.equal(child.killCount, 1)
  }
})

test('unexpected exit rejects startup', async () => {
  const child = fakeChild()
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.emit('exit', 2, null)
  await assert.rejects(starting, /exited/)
})

test('close kills a child that does not exit', async () => {
  const child = fakeChild()
  child.kill = () => {
    child.killCount += 1
  }
  const client = new BrowserClient('service', {
    spawn: () => child,
    closeTimeoutMs: 5,
  })
  const starting = client.start()
  child.ready()
  await starting
  await client.close()
  assert.equal(child.killCount, 1)
})

test('backpressure queues commands in order and resumes once on drain', async () => {
  const child = fakeChild()
  const writes = []
  let blockNext = true
  child.stdin.write = (command) => {
    writes.push(command)

    if (blockNext) {
      blockNext = false
      return false
    }

    return true
  }
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.ready()
  await starting

  const id = client.list('C:\\one', { kind: 'all' }, () => {})
  client.cancel(id)
  assert.equal(writes.length, 1)
  assert.equal(child.stdin.listenerCount('drain'), 1)

  child.stdin.emit('drain')
  assert.equal(writes.length, 2)
  assert.deepEqual(
    writes.map((command) => JSON.parse(command).type),
    ['list', 'cancel'],
  )
  assert.equal(child.stdin.listenerCount('drain'), 1)
  await client.close()
})

test('command queue overflow fails the session visibly', async () => {
  const child = fakeChild()
  child.stdin.write = () => false
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.ready()
  await starting

  for (let index = 0; index < 34; index += 1) {
    client.list(`C:\\item-${index}`, { kind: 'all' }, () => {})
  }

  assert.equal(child.killCount, 1)
  await assert.rejects(client.start(), /unavailable/)
  await client.close()
})

test('close while backpressured settles by deadline and kills the child', async () => {
  const child = fakeChild()
  child.stdin.write = () => false
  const client = new BrowserClient('service', {
    spawn: () => child,
    closeTimeoutMs: 5,
  })
  const starting = client.start()
  child.ready()
  await starting
  client.list('C:\\one', { kind: 'all' }, () => {})

  await client.close()
  assert.equal(child.killCount, 1)
  assert.equal(child.stdin.listenerCount('drain'), 0)
})

test('real service sends ready and closes once', async (context) => {
  const executable = process.env.FILEJAM_FS_SERVICE
  if (!executable) {
    context.skip('FILEJAM_FS_SERVICE is not configured')
    return
  }
  const client = new BrowserClient(executable, { spawn })
  await client.start()
  await client.close()
})

test('listing returns before callbacks, retires old ids, and cancels locally before wire', async () => {
  const child = fakeChild()
  const writes = []
  child.stdin.write = (command) => {
    writes.push(JSON.parse(command))
    return true
  }
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.ready()
  await starting

  const firstEvents = []
  let returned = false
  const first = client.list(
    'C:\\one',
    { nameContains: '', kind: 'all', sortDirection: 'asc' },
    (event) => {
      assert.equal(returned, true)
      firstEvents.push(event)
    },
  )
  returned = true
  const secondEvents = []
  const second = client.list(
    'C:\\two',
    { nameContains: '', kind: 'all', sortDirection: 'asc' },
    (event) => secondEvents.push(event),
  )
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'done', id: first, total: 0 })}\n`,
  )
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'listing', id: second, path: 'C:\\two', parentPath: 'C:', total: 0, metrics: { enumerationMs: 0, filterSortMs: 0 } })}\n`,
  )
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'done', id: second, total: 0 })}\n`,
  )
  assert.equal(firstEvents.length, 0)
  assert.deepEqual(
    secondEvents.map(({ type }) => type),
    ['listing', 'done'],
  )

  const third = client.list(
    'C:\\three',
    { nameContains: '', kind: 'all', sortDirection: 'asc' },
    () => {},
  )
  client.cancel(third)
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'error', id: third, code: 'IO_ERROR', message: 'cancelled locally' })}\n`,
  )
  assert.deepEqual(
    writes.slice(-2).map(({ type }) => type),
    ['list', 'cancel'],
  )
  await client.close()
})

test('pulls one batch per next and validates listing sequence', async () => {
  const child = fakeChild()
  const writes = []
  child.stdin.write = (command) => {
    writes.push(JSON.parse(command))
    return true
  }
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.ready()
  await starting
  const events = []
  const id = client.list(
    'C:\\one',
    { nameContains: '', kind: 'all', sortDirection: 'asc' },
    (event) => events.push(event),
  )
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'listing', id, path: 'C:\\one', parentPath: 'C:', total: 1, metrics: { enumerationMs: 0, filterSortMs: 0 } })}\n`,
  )

  client.next(id)
  client.next(id)
  assert.equal(writes.filter(({ type }) => type === 'next').length, 1)
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'batch', id, offset: 0, entries: [{ path: 'C:\\one\\a', name: 'a', kind: 'file' }] })}\n`,
  )
  client.next(id)
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'done', id, total: 1 })}\n`,
  )
  assert.deepEqual(
    events.map(({ type }) => type),
    ['listing', 'batch', 'done'],
  )
  await client.close()
})

test('unsolicited batch and premature done fail before the error callback', async () => {
  for (const terminal of ['batch', 'done']) {
    const child = fakeChild()
    const client = new BrowserClient('service', { spawn: () => child })
    const starting = client.start()
    child.ready()
    await starting
    let unavailableDuringCallback = false
    const id = client.list(
      'C:\\one',
      { nameContains: '', kind: 'all', sortDirection: 'asc' },
      (event) => {
        if (event.type === 'error') {
          unavailableDuringCallback = true
          assert.throws(
            () =>
              client.list(
                'C:\\two',
                { nameContains: '', kind: 'all', sortDirection: 'asc' },
                () => {},
              ),
            /not ready/,
          )
        }
      },
    )
    child.stdout.write(
      `${JSON.stringify({ v: 1, type: 'listing', id, path: 'C:\\one', parentPath: 'C:', total: 1, metrics: { enumerationMs: 0, filterSortMs: 0 } })}\n`,
    )
    const event =
      terminal === 'batch'
        ? {
            v: 1,
            type: 'batch',
            id,
            offset: 0,
            entries: [{ path: 'C:\\one\\a', name: 'a', kind: 'file' }],
          }
        : { v: 1, type: 'done', id, total: 1 }
    child.stdout.write(`${JSON.stringify(event)}\n`)
    assert.equal(unavailableDuringCallback, true)
    await client.close()
  }
})

test('real service listing completes through renderer pulls', async (context) => {
  const executable = process.env.FILEJAM_FS_SERVICE
  if (!executable) {
    context.skip('FILEJAM_FS_SERVICE is not configured')
    return
  }
  const client = new BrowserClient(executable, { spawn })
  await client.start()
  const root = new URL('../../../docs/browser-poc/fixtures/', import.meta.url)
    .pathname
  const fixturePath =
    process.platform === 'win32'
      ? decodeURIComponent(root).replace(/^\//, '')
      : decodeURIComponent(root)
  const events = []
  const complete = new Promise((resolve, reject) => {
    const id = client.list(
      fixturePath,
      { nameContains: 'view-cases', kind: 'file', sortDirection: 'asc' },
      (event) => {
        events.push(event)
        if (event.type === 'listing' && event.total > 0) {
          client.next(id)
        } else if (event.type === 'batch') {
          client.next(id)
        } else if (event.type === 'done') {
          resolve()
        } else if (event.type === 'error') {
          reject(new Error(event.message))
        }
      },
    )
  })
  await complete
  assert.ok(events.some(({ type }) => type === 'batch'))
  assert.ok(
    events.some(
      ({ type, entries }) =>
        type === 'batch' &&
        entries.some(({ name }) => name === 'view-cases.json'),
    ),
  )
  await client.close()
})

test('malformed event for a retired listing still fails protocol validation', async () => {
  const child = fakeChild()
  const client = new BrowserClient('service', { spawn: () => child })
  const starting = client.start()
  child.ready()
  await starting
  const id = client.list(
    'C:\\one',
    { nameContains: '', kind: 'all', sortDirection: 'asc' },
    () => {},
  )
  client.list(
    'C:\\two',
    { nameContains: '', kind: 'all', sortDirection: 'asc' },
    () => {},
  )
  child.stdout.write(
    `${JSON.stringify({ v: 1, type: 'done', id, total: 'bad' })}\n`,
  )
  assert.equal(child.killCount, 1)
  await client.close()
})
