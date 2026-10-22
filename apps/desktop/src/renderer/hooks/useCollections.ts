import { useCallback } from 'react'
import { queryKeys } from '../queryClient.js'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

export function notifyCollectionsChanged() {
  window.dispatchEvent(new Event('collections-changed'))
}

export function useCollections() {
  const api = useApi()
  const request = useCallback(() => api.collections.list(), [api])
  const {
    data: collections,
    refresh,
    ...state
  } = useApiQuery(queryKeys.collections, request, [], {
    staleTime: Number.POSITIVE_INFINITY,
  })

  return { collections, refresh, ...state }
}
