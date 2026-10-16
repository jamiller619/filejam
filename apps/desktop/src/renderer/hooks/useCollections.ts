import { useCallback, useEffect } from 'react'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

export function notifyCollectionsChanged() {
  window.dispatchEvent(new Event('collections-changed'))
}

export function useCollections() {
  const api = useApi()
  const request = useCallback(() => api.collections.list(), [api])
  const { data: collections, refresh, ...state } = useApiQuery(request, [])
  useEffect(() => {
    window.addEventListener('collections-changed', refresh)
    return () => window.removeEventListener('collections-changed', refresh)
  }, [refresh])
  return { collections, refresh, ...state }
}
