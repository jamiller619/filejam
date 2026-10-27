import assert from 'node:assert/strict'
import test from 'node:test'
import { canEnumerateMft, parseMftMessage } from '../dist/scanner/mft.js'

test('MFT enumeration is limited to full local Windows scans with a helper', () => {
  assert.equal(
    canEnumerateMft('C:\\library', 'C:\\library', 'filejam-mft.exe'),
    process.platform === 'win32',
  )
  assert.equal(
    canEnumerateMft('C:\\library', 'C:\\library\\changed', 'filejam-mft.exe'),
    false,
  )
  assert.equal(
    canEnumerateMft(
      '\\\\server\\share',
      '\\\\server\\share',
      'filejam-mft.exe',
    ),
    false,
  )
  assert.equal(canEnumerateMft('C:\\library', 'C:\\library', undefined), false)
})

test('MFT protocol carries scan mode, journal checkpoint, and native metadata', () => {
  assert.deepEqual(
    parseMftMessage(
      JSON.stringify({
        type: 'ready',
        total: 2,
        mode: 'incremental',
        journalId: '18446744073709551615',
        nextUsn: '1234',
      }),
    ),
    {
      type: 'ready',
      total: 2,
      mode: 'incremental',
      journalId: '18446744073709551615',
      nextUsn: '1234',
    },
  )

  assert.deepEqual(
    parseMftMessage(
      JSON.stringify({
        type: 'batch',
        entries: [
          {
            path: 'example.txt',
            directory: false,
            deleted: false,
            size: 5,
            modifiedAt: 1000,
            createdAt: 500,
            missing: false,
          },
        ],
      }),
    ),
    {
      type: 'batch',
      entries: [
        {
          path: 'example.txt',
          directory: false,
          deleted: false,
          size: 5,
          modifiedAt: 1000,
          createdAt: 500,
          missing: false,
        },
      ],
    },
  )

  assert.throws(
    () =>
      parseMftMessage(
        JSON.stringify({
          type: 'batch',
          entries: [{ path: 'example.txt', directory: false }],
        }),
      ),
    /invalid message/,
  )
})
