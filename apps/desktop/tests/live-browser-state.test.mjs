import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createInitialState,
  reduceBrowserState,
} from '../dist/renderer/live-browser/state.js'

const options = { nameContains: 'photo', kind: 'file', sortDirection: 'desc' }
const entry = { path: '/photos/a.jpg', name: 'a.jpg', kind: 'file' }

test('initial state has empty defaults and independent options', () => {
  const first = createInitialState()
  const second = createInitialState()

  assert.equal(first.phase, 'idle')
  assert.deepEqual(first.entries, [])
  assert.notEqual(first.entries, second.entries)
  assert.notEqual(first.appliedOptions, second.appliedOptions)
})

test('begin clears transient state, copies options, and ignores stale generations', () => {
  let state = {
    ...createInitialState(),
    entries: [entry],
    requestId: 'old',
    error: 'old',
  }
  state = reduceBrowserState(state, {
    type: 'begin',
    generation: 2,
    path: '/photos',
    options,
  })

  assert.equal(state.phase, 'loading')
  assert.equal(state.requestId, null)
  assert.deepEqual(state.entries, [])
  assert.equal(state.error, null)
  assert.notEqual(state.appliedOptions, options)

  options.nameContains = 'changed'
  assert.equal(state.appliedOptions.nameContains, 'photo')
  assert.equal(
    reduceBrowserState(state, {
      type: 'begin',
      generation: 1,
      path: '/',
      options,
    }),
    state,
  )
})

test('attachId binds once and rejects a mismatched id', () => {
  const loading = reduceBrowserState(createInitialState(), {
    type: 'begin',
    generation: 1,
    path: '/',
    options,
  })
  const attached = reduceBrowserState(loading, {
    type: 'attachId',
    generation: 1,
    id: 'request-1',
  })
  assert.equal(attached.requestId, 'request-1')
  assert.equal(
    reduceBrowserState(attached, {
      type: 'attachId',
      generation: 1,
      id: 'request-1',
    }).requestId,
    'request-1',
  )

  const mismatch = reduceBrowserState(attached, {
    type: 'attachId',
    generation: 1,
    id: 'request-2',
  })
  assert.equal(mismatch.phase, 'error')
  assert.equal(mismatch.error, 'Invalid listing response')
})

test('selection accepts a valid row and null, while ignoring invalid indexes', () => {
  const state = { ...createInitialState(), entries: [entry] }
  assert.equal(
    reduceBrowserState(state, { type: 'select', index: 0 }).selectedIndex,
    0,
  )
  assert.equal(
    reduceBrowserState(state, { type: 'select', index: null }).selectedIndex,
    null,
  )
  assert.equal(reduceBrowserState(state, { type: 'select', index: 1 }), state)
})

test('listing twice and batches beyond total fail as invalid responses', () => {
  let state = reduceBrowserState(createInitialState(), {
    type: 'begin',
    generation: 1,
    path: '/photos',
    options,
  })
  const listing = {
    v: 1,
    type: 'listing',
    id: 'request-1',
    path: '/photos',
    parentPath: '/',
    total: 1,
    metrics: { enumerationMs: 1, filterSortMs: 1 },
  }

  state = reduceBrowserState(state, {
    type: 'event',
    generation: 1,
    event: listing,
  })
  state = reduceBrowserState(state, {
    type: 'event',
    generation: 1,
    event: listing,
  })
  assert.equal(state.phase, 'error')
  assert.equal(state.error, 'Invalid listing response')
  assert.deepEqual(state.entries, [])

  state = reduceBrowserState(createInitialState(), {
    type: 'begin',
    generation: 1,
    path: '/photos',
    options,
  })
  state = reduceBrowserState(state, {
    type: 'event',
    generation: 1,
    event: listing,
  })
  state = reduceBrowserState(state, {
    type: 'event',
    generation: 1,
    event: {
      v: 1,
      type: 'batch',
      id: 'request-1',
      offset: 0,
      entries: [entry, { ...entry, name: 'b.jpg' }],
    },
  })
  assert.equal(state.phase, 'error')
  assert.equal(state.error, 'Invalid listing response')
  assert.deepEqual(state.entries, [])
})

test('invalid current selection ids fail visibly and clear rows', () => {
  const row = entry
  let state = {
    ...createInitialState(),
    generation: 1,
    requestId: 'request-1',
    phase: 'receiving',
    total: 1,
    entries: [row],
    selectedIndex: 0,
  }

  state = reduceBrowserState(state, {
    type: 'event',
    generation: 1,
    event: {
      v: 1,
      type: 'cancelled',
      id: 'request-2',
    },
  })
  assert.equal(state.phase, 'error')
  assert.equal(state.error, 'Invalid listing response')
  assert.deepEqual(state.entries, [])
})
