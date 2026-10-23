import type {
  ColumnSizingState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table'
import { type FileColumn, fileColumnLabels } from './fileColumns.js'

export type FileViewMode = 'list' | 'grid' | 'masonry'

export const defaultCardSize = 150
export const minimumCardSize = 96
export const maximumCardSize = 260

type TablePreferences = {
  flatten: boolean
  viewMode: FileViewMode
  cardSize: number
  groupBy: FileColumn | null
  sorting: SortingState
  columnVisibility: VisibilityState
  columnSizing: ColumnSizingState
}

const storagePrefix = 'files:table:v1:'

export function readTablePreferences(page: string): TablePreferences {
  const defaults: TablePreferences = {
    flatten: false,
    viewMode: 'list',
    cardSize: defaultCardSize,
    groupBy: null,
    sorting: [],
    columnVisibility: {},
    columnSizing: {},
  }

  try {
    const stored = localStorage.getItem(storagePrefix + page)

    if (!stored) {
      return defaults
    }

    const value = JSON.parse(stored)

    if (!value || typeof value !== 'object') {
      return defaults
    }

    return {
      flatten: value.flatten === true,
      viewMode:
        value.viewMode === 'grid' || value.viewMode === 'masonry'
          ? value.viewMode
          : 'list',
      cardSize:
        typeof value.cardSize === 'number' &&
        Number.isFinite(value.cardSize) &&
        value.cardSize >= minimumCardSize &&
        value.cardSize <= maximumCardSize
          ? value.cardSize
          : defaults.cardSize,
      groupBy:
        typeof value.groupBy === 'string' &&
        Object.hasOwn(fileColumnLabels, value.groupBy)
          ? (value.groupBy as FileColumn)
          : defaults.groupBy,
      sorting: Array.isArray(value.sorting)
        ? value.sorting.filter(
            (sort: unknown): sort is SortingState[number] =>
              typeof sort === 'object' &&
              sort !== null &&
              'id' in sort &&
              typeof sort.id === 'string' &&
              Object.hasOwn(fileColumnLabels, sort.id) &&
              'desc' in sort &&
              typeof sort.desc === 'boolean',
          )
        : defaults.sorting,
      columnVisibility: {
        ...defaults.columnVisibility,
        ...Object.fromEntries(
          Object.entries(value.columnVisibility ?? {}).filter(
            ([id, visible]) =>
              Object.hasOwn(fileColumnLabels, id) &&
              typeof visible === 'boolean',
          ),
        ),
        name: true,
      },
      columnSizing: Object.fromEntries(
        Object.entries(value.columnSizing ?? {}).filter(
          (entry): entry is [string, number] => {
            const [id, size] = entry

            return (
              Object.hasOwn(fileColumnLabels, id) &&
              typeof size === 'number' &&
              Number.isFinite(size) &&
              size > 0
            )
          },
        ),
      ),
    }
  } catch {
    return defaults
  }
}

export function writeTablePreferences(page: string, value: TablePreferences) {
  try {
    localStorage.setItem(storagePrefix + page, JSON.stringify(value))
  } catch {
    // Keep the table usable when browser storage is unavailable or full.
  }
}
