import { useCallback } from 'react'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

export function useLibraries() {
  const api = useApi()
  const request = useCallback(() => api.libraries.list(), [api])
  const { data: libraries, loading, loadFailed } = useApiQuery(request, [])

  return {
    libraries,
    loading,
    loadFailed,
  }
}
