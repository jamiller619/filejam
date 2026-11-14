import type { DateFormat, FileColumn } from '../../utils/fileColumns.js'
import { formatFileSize, formatFileValue } from '../../utils/fileColumns.js'
import {
  fileSizeRangeIndex,
  fileSizeThresholds,
} from '../../utils/fileSizeRanges.js'
import type { FileRow, FileRowGroup } from './Files.types.js'

type RangeGroup = {
  key: string
  label: string
  order: number
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getDateRangeGroup(date: Date, referenceDate: Date): RangeGroup {
  const today = startOfDay(referenceDate)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const thisWeek = new Date(today)
  thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay())

  const lastWeek = new Date(thisWeek)
  lastWeek.setDate(lastWeek.getDate() - 7)

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const thisYear = new Date(today.getFullYear(), 0, 1)

  if (date >= today) {
    return { key: 'today', label: 'Today', order: 0 }
  }

  if (date >= yesterday) {
    return { key: 'yesterday', label: 'Yesterday', order: 1 }
  }

  if (date >= thisWeek) {
    return { key: 'this-week', label: 'Earlier this week', order: 2 }
  }

  if (date >= lastWeek) {
    return { key: 'last-week', label: 'Last week', order: 3 }
  }

  if (date >= thisMonth) {
    return { key: 'this-month', label: 'Earlier this month', order: 4 }
  }

  if (date >= lastMonth) {
    return { key: 'last-month', label: 'Last month', order: 5 }
  }

  if (date >= thisYear) {
    return { key: 'this-year', label: 'Earlier this year', order: 6 }
  }

  return { key: 'older', label: 'Older', order: 7 }
}

function getSizeRangeGroup(size: number): RangeGroup {
  const order = fileSizeRangeIndex(size)
  const lower = fileSizeThresholds[order - 1] ?? 0
  const upper = fileSizeThresholds[order]
  const label =
    upper === undefined
      ? `${formatFileSize(lower)} and above`
      : lower === 0
        ? `Under ${formatFileSize(upper)}`
        : `${formatFileSize(lower)} – under ${formatFileSize(upper)}`

  return { key: String(order), label, order }
}

export function groupFileRows(
  rows: FileRow[],
  groupBy: FileColumn | null,
  dateFormat: DateFormat,
  referenceDate: Date,
): FileRowGroup[] {
  if (!groupBy) {
    return [{ key: 'all', label: null, order: undefined, rows }]
  }

  const groups = rows.reduce((groups, row) => {
    const value = row.getValue(groupBy)
    const range =
      value instanceof Date
        ? getDateRangeGroup(value, referenceDate)
        : groupBy === 'size' && typeof value === 'number'
          ? getSizeRangeGroup(value)
          : undefined
    const key = range
      ? `${value instanceof Date ? 'date' : 'size'}:${range.key}`
      : (JSON.stringify(value) ?? String(value))
    const label = range
      ? range.label
      : groupBy === 'relativePath'
        ? row.getValue<string>(groupBy)
        : formatFileValue(row.original, groupBy, dateFormat)
    const group = groups.get(key)

    if (group) {
      group.rows.push(row)
    } else {
      groups.set(key, {
        key,
        label,
        order: range?.order,
        rows: [row],
      })
    }

    return groups
  }, new Map<string, FileRowGroup>())

  return Array.from(groups.values()).sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  )
}
