import { useCallback } from 'react'
import { queryKeys } from '../queryClient.js'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

export function useLibraries() {
  const api = useApi()
  const request = useCallback(() => api.libraries.list(), [api])

  const {
    data: libraries,
    loading,
    loadFailed,
    refresh,
  } = useApiQuery(queryKeys.libraries, request, [], {
    staleTime: Number.POSITIVE_INFINITY,
  })

  return {
    libraries,
    loading,
    loadFailed,
    refresh,
  }
}
