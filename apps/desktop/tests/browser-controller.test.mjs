import assert from 'node:assert/strict'
import test from 'node:test'
import { BrowserController } from '../dist/renderer/browser/controller.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('renderer begin clock resets on navigation and stops after disposal', () => {
  let now = 10
  const api = {
    onEvent: () => () => {},
    start: () => new Promise(() => {}),
    cancel: async () => {},
  }
  const controller = new BrowserController(
    api,
    () => {},
    () => now,
  )
  const options = { kind: 'all', nameContains: '', sortDirection: 'asc' }
  controller.navigate('C:\\one', options)
  assert.equal(controller.startedAt, 10)
  now = 50
  controller.navigate('C:\\two', options)
  assert.equal(controller.startedAt, 50)
  controller.dispose()
  now = 90
  controller.navigate('C:\\three', options)
  assert.equal(controller.startedAt, 50)
})

function setup() {
  const starts = []
  const cancels = []
  const listeners = new Set()
  let unsubscribes = 0
  const api = {
    mode: 'browser-poc',
    chooseFolder: async () => null,
    start(input) {
      const result = deferred()
      starts.push({ input, result })
      return result.promise
    },
    next: async () => {},
    cancel(id) {
      cancels.push(id)
      return Promise.resolve()
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => {
        unsubscribes += 1
        listeners.delete(listener)
      }
    },
  }
  const states = []
  const controller = new BrowserController(api, (state) => states.push(state))

  return {
    api,
    cancels,
    controller,
    emit(event) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    get starts() {
      return starts
    },
    get states() {
      return states
    },
    get unsubscribes() {
      return unsubscribes
    },
  }
}

const options = { nameContains: '', kind: 'all', sortDirection: 'asc' }
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('accepts an early listing and ignores stale start rejection after navigation', async () => {
  const fake = setup()
  fake.controller.navigate('A', options)
  fake.emit({
    v: 1,
    type: 'listing',
    id: 'r-1',
    generation: 1,
    path: 'A',
    parentPath: null,
    total: 0,
    metrics: { enumerationMs: 0, filterSortMs: 0 },
  })
  fake.starts[0].result.resolve({ id: 'r-1' })
  await flush()
  assert.equal(fake.controller.state.phase, 'receiving')
  assert.equal(fake.controller.state.requestId, 'r-1')

  fake.controller.navigate('B', options)
  fake.starts[0].result.reject(new Error('stale start failed'))
  await flush()
  assert.equal(fake.controller.state.phase, 'loading')
  assert.equal(fake.controller.state.requestedPath, 'B')
  assert.deepEqual(fake.cancels, ['r-1'])
})

test('cancels a request when its current event is invalid', async () => {
  const fake = setup()
  fake.controller.navigate('A', options)
  fake.starts[0].result.resolve({ id: 'r-1' })
  await flush()
  fake.emit({
    v: 1,
    type: 'listing',
    id: 'wrong-id',
    generation: 1,
    path: 'A',
    parentPath: null,
    total: 0,
    metrics: { enumerationMs: 0, filterSortMs: 0 },
  })

  assert.equal(fake.controller.state.phase, 'error')
  assert.equal(fake.controller.state.error, 'Invalid listing response')
  assert.deepEqual(fake.cancels, ['r-1'])
})

test('cancels late starts after dispose and unsubscribes once', async () => {
  const fake = setup()
  fake.controller.navigate('A', options)
  fake.controller.dispose()
  fake.controller.dispose()
  const stateCountAfterDispose = fake.states.length
  fake.starts[0].result.resolve({ id: 'r-1' })
  await flush()

  assert.equal(fake.unsubscribes, 1)
  assert.deepEqual(fake.cancels, ['r-1'])
  assert.equal(fake.states.length, stateCountAfterDispose)
})

test('selection and an empty listing do not request another batch', async () => {
  const fake = setup()
  let nextCalls = 0
  fake.api.next = async () => {
    nextCalls += 1
  }

  fake.controller.navigate('A', options)
  fake.starts[0].result.resolve({ id: 'r-1' })
  await flush()
  fake.emit({
    v: 1,
    type: 'listing',
    id: 'r-1',
    generation: 1,
    path: 'A',
    parentPath: null,
    total: 0,
    metrics: { enumerationMs: 0, filterSortMs: 0 },
  })
  fake.controller.select(null)
  fake.controller.pullNext()
  fake.controller.select(0)
  fake.controller.pullNext()

  assert.equal(nextCalls, 0)
})

test('pulls once for a received count and exposes current pull failures', async () => {
  const fake = setup()
  let rejectNext
  let nextCalls = 0
  fake.api.next = () => {
    nextCalls += 1
    return new Promise((_resolve, reject) => {
      rejectNext = reject
    })
  }

  fake.controller.navigate('A', options)
  fake.starts[0].result.resolve({ id: 'r-1' })
  await flush()
  fake.emit({
    v: 1,
    type: 'listing',
    id: 'r-1',
    generation: 1,
    path: 'A',
    parentPath: null,
    total: 2,
    metrics: { enumerationMs: 0, filterSortMs: 0 },
  })

  fake.controller.pullNext()
  fake.controller.select(0)
  fake.controller.pullNext()
  assert.equal(nextCalls, 1)

  rejectNext(new Error('batch failed'))
  await flush()
  assert.equal(fake.controller.state.phase, 'error')
  assert.equal(fake.controller.state.error, 'batch failed')
  fake.controller.pullNext()
  assert.equal(nextCalls, 1)
})
