import assert from 'node:assert/strict'
import test from 'node:test'
import { JsonLineReader } from '../dist/live-browser/lines.js'

const ready = Buffer.from('{"v":1,"type":"ready"}\n')

test('parses a Unicode event split at every byte without loss or duplication', () => {
  const encoded = Buffer.from(
    `${JSON.stringify({ v: 1, type: 'error', id: 'r-1', code: 'IO_ERROR', message: 'café 😀' })}\n`,
  )

  for (let split = 0; split <= encoded.length; split += 1) {
    const reader = new JsonLineReader()
    const events = [
      ...reader.push(encoded.subarray(0, split)),
      ...reader.push(encoded.subarray(split)),
    ]

    reader.end()
    assert.equal(events.length, 1)
    assert.equal(events[0].message, 'café 😀')
  }
})

test('accepts CRLF and multiple complete lines in one chunk', () => {
  const reader = new JsonLineReader()

  assert.deepEqual(
    reader.push(
      Buffer.from('{"v":1,"type":"ready"}\r\n{"v":1,"type":"ready"}\n'),
    ),
    [
      { v: 1, type: 'ready' },
      { v: 1, type: 'ready' },
    ],
  )
  reader.end()
})

test('rejects invalid JSON and invalid UTF-8', () => {
  assert.throws(() => new JsonLineReader().push(Buffer.from('{bad}\n')))
  assert.throws(() => new JsonLineReader().push(Buffer.from([0xff, 0x0a])))
})

test('bounds an unfinished frame and rejects a partial frame at EOF', () => {
  const oversized = new JsonLineReader()
  assert.throws(() => oversized.push(Buffer.alloc(1_048_578, 0x61)))

  const partial = new JsonLineReader()
  assert.deepEqual(partial.push(ready.subarray(0, -1)), [])
  assert.throws(() => partial.end())
})

test('does not combine several valid short frames into one oversized frame', () => {
  const reader = new JsonLineReader()
  const chunk = Buffer.concat(Array.from({ length: 60_000 }, () => ready))

  assert.equal(reader.push(chunk).length, 60_000)
  reader.end()
})
