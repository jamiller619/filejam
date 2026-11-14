import { QueryClient } from '@tanstack/react-query'

export const queryKeys = {
  libraries: ['libraries'] as const,
  collections: ['collections'] as const,
  settings: (keys: readonly string[]) => ['settings', ...keys] as const,
  files: (source: {
    collectionId?: string | undefined
    libraryId?: number | undefined
    relativePath?: string | undefined
    flatten: boolean
    search?: string | undefined
  }) =>
    [
      'files',
      source.collectionId
        ? ['collection', source.collectionId]
        : ['folder', source.libraryId, source.relativePath],
      { flatten: source.flatten, search: source.search },
    ] as const,
  entryCollections: (entryId: number) =>
    ['entry-collections', entryId] as const,
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      networkMode: 'always',
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
