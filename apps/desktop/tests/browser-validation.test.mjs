import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseServiceEvent,
  validateRequestId,
  validateStartInput,
} from '../dist/browser/validate.js'

const options = { nameContains: '', kind: 'all', sortDirection: 'asc' }
const id = 'r-1'

function event(type, fields = {}) {
  return { v: 1, type, ...fields }
}

test('accepts every service event shape', () => {
  assert.equal(parseServiceEvent(event('ready')).type, 'ready')
  assert.equal(
    parseServiceEvent(
      event('listing', {
        id,
        path: 'C:\\',
        parentPath: null,
        total: 0,
        metrics: { enumerationMs: 0, filterSortMs: 1 },
      }),
    ).type,
    'listing',
  )
  assert.equal(
    parseServiceEvent(
      event('batch', {
        id,
        offset: 0,
        entries: [{ path: 'C:\\a', name: 'a', kind: 'file' }],
      }),
    ).type,
    'batch',
  )
  assert.equal(parseServiceEvent(event('done', { id, total: 0 })).type, 'done')
  assert.equal(parseServiceEvent(event('cancelled', { id })).type, 'cancelled')
  assert.equal(
    parseServiceEvent(
      event('error', { id, code: 'IO_ERROR', message: 'failed' }),
    ).type,
    'error',
  )
})

test('rejects malformed envelopes, fields, values, and ids', () => {
  const valid = event('done', { id, total: 1 })
  for (const bad of [
    {},
    { ...valid, extra: true },
    { ...valid, v: 2 },
    { ...valid, id: undefined },
    { ...valid, total: NaN },
    { ...valid, total: Infinity },
    { ...valid, total: 1.5 },
    event('done', { id, total: 1, unexpected: false }),
    event('listing', {
      id,
      path: 'C:\\',
      parentPath: null,
      total: 0,
      metrics: { enumerationMs: Infinity, filterSortMs: 0 },
    }),
    event('error', { id, code: 'SERVICE_UNAVAILABLE', message: 'offline' }),
    event('error', { id, code: 'IO_ERROR', message: 'x'.repeat(4097) }),
    event('batch', {
      id,
      offset: 0,
      entries: [{ path: 'x', name: 'x', kind: 'bogus' }],
    }),
  ]) {
    assert.throws(() => parseServiceEvent(bad))
  }

  for (const badId of ['', 'a'.repeat(65), 'bad id', 'é', 'x\0y']) {
    assert.throws(() => validateRequestId(badId))
  }
  assert.equal(validateRequestId(id), id)
})

test('validates start arguments, paths, scalar counts, and UTF-8 limits', () => {
  assert.deepEqual(
    validateStartInput({ generation: 1, path: 'C:\\Users\\x', options }),
    {
      generation: 1,
      path: 'C:\\Users\\x',
      options,
    },
  )
  assert.deepEqual(
    validateStartInput({ generation: 1, path: '\\\\?\\C:\\x', options }).path,
    '\\\\?\\C:\\x',
  )

  for (const path of [
    'relative',
    'C:relative',
    '\\rooted',
    '\\\\.\\device',
    'C:\\a\\..\\b',
    'x\0y',
    'x'.repeat(32769),
    '\ud800',
  ]) {
    assert.throws(() => validateStartInput({ generation: 1, path, options }))
  }
  for (const nameContains of ['x'.repeat(1025), '\ud800', 'x\0y']) {
    assert.throws(() =>
      validateStartInput({
        generation: 1,
        path: 'C:\\x',
        options: { ...options, nameContains },
      }),
    )
  }
  assert.doesNotThrow(() =>
    validateStartInput({
      generation: 1,
      path: 'C:\\x',
      options: { ...options, nameContains: '😀'.repeat(1024) },
    }),
  )
  assert.throws(() =>
    validateStartInput({ generation: 1.5, path: 'C:\\x', options }),
  )
  assert.throws(() =>
    validateStartInput({
      generation: 1,
      path: 'C:\\x',
      options: { ...options, kind: 'unknown' },
    }),
  )
  assert.throws(() =>
    validateStartInput({
      generation: 1,
      path: 'C:\\x',
      options: { ...options, extra: true },
    }),
  )
})
