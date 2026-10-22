import {
  type QueryKey,
  type UseQueryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'

type ApiQueryOptions<T> = {
  keepPreviousData?: boolean
  placeholderData?: () => T | undefined
  staleTime?: number
}

type DataUpdate<T> = T | ((current: T) => T)

export function useApiQuery<T>(
  queryKey: QueryKey,
  request: () => Promise<T>,
  initialData: T,
  options: ApiQueryOptions<T> = {},
) {
  const queryClient = useQueryClient()
  const queryOptions: UseQueryOptions<T, Error, T, QueryKey> = {
    queryKey,
    queryFn: request,
  }

  if (options.keepPreviousData) {
    queryOptions.placeholderData = ((previousData: T | undefined) =>
      previousData ?? options.placeholderData?.()) as NonNullable<
      typeof queryOptions.placeholderData
    >
  }

  if (options.staleTime !== undefined) {
    queryOptions.staleTime = options.staleTime
  }

  const query = useQuery(queryOptions)

  const setData = useCallback(
    (update: DataUpdate<T>) => {
      queryClient.setQueryData<T>(queryKey, (cachedData) => {
        const current = cachedData ?? initialData

        return typeof update === 'function'
          ? (update as (value: T) => T)(current)
          : update
      })
    },
    [initialData, queryClient, queryKey],
  )

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey, exact: true })
  }, [queryClient, queryKey])

  return {
    data: query.data ?? initialData,
    setData,
    loading: query.isPending,
    loadFailed: query.isError && query.data === undefined,
    refreshing: query.isFetching,
    refresh,
  }
}
