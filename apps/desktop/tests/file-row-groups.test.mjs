import assert from 'node:assert/strict'
import test from 'node:test'
import { groupFileRows } from '../dist/renderer/components/files/fileRowGroups.js'

const referenceDate = new Date(2026, 10, 11, 12)

function row(value, column = 'size') {
  return { original: { [column]: value }, getValue: () => value }
}

test('size ranges collect different sizes and preserve row order within each range', () => {
  const rows = [row(5_000), row(0), row(1_000), row(999), row(null)]
  const groups = groupFileRows(rows, 'size', 'relative', referenceDate)

  assert.deepEqual(
    groups.map(({ label, rows }) => [
      label,
      rows.map((row) => row.original.size),
    ]),
    [
      ['Under 1 KB', [0, 999]],
      ['—', [null]],
      ['1 KB – under 1 MB', [5_000, 1_000]],
    ],
  )
})

test('each size boundary starts the next range, including the open-ended range', () => {
  const boundaries = [
    1_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000,
    100_000_000_000,
  ]

  for (const [index, boundary] of boundaries.entries()) {
    const groups = groupFileRows(
      [row(boundary), row(boundary - 1)],
      'size',
      'relative',
      referenceDate,
    )

    assert.deepEqual(
      groups.map((group) => group.order),
      [index, index + 1],
    )
    assert.equal(groups[0].rows[0].original.size, boundary - 1)
  }

  const groups = groupFileRows(
    [row(100_000_000_000), row(1_000_000_000_000)],
    'size',
    'relative',
    referenceDate,
  )

  assert.equal(groups.length, 1)
  assert.equal(groups[0].label, '100 GB and above')
})

test('dates still group by range and ungrouped rows remain intact', () => {
  const rows = [
    row(new Date(2026, 10, 10, 12), 'modifiedAt'),
    row(new Date(2026, 10, 11, 8), 'modifiedAt'),
    row(new Date(2026, 10, 11, 10), 'modifiedAt'),
  ]
  const groups = groupFileRows(rows, 'modifiedAt', 'relative', referenceDate)

  assert.deepEqual(
    groups.map((group) => group.label),
    ['Today', 'Yesterday'],
  )
  assert.deepEqual(groups[0].rows, rows.slice(1))
  assert.equal(
    groupFileRows(rows, null, 'relative', referenceDate)[0].rows,
    rows,
  )
})
