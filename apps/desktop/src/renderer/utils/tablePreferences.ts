import type { SortingState, VisibilityState } from '@tanstack/react-table'
import { fileColumnLabels } from './fileColumns.js'

export type FileViewMode = 'list' | 'grid'

type TablePreferences = {
  viewMode: FileViewMode
  sorting: SortingState
  columnVisibility: VisibilityState
}

const storagePrefix = 'files:table:v1:'

export function readTablePreferences(page: string): TablePreferences {
  const defaults: TablePreferences = {
    viewMode: 'list',
    sorting: [],
    columnVisibility: { tags: false },
  }
  try {
    const stored = localStorage.getItem(storagePrefix + page)
    if (!stored) return defaults
    const value = JSON.parse(stored)
    if (!value || typeof value !== 'object') return defaults
    return {
      viewMode: value.viewMode === 'grid' ? 'grid' : 'list',
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
