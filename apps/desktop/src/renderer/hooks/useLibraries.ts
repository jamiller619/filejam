import { useCallback, useEffect } from 'react'
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
  } = useApiQuery(request, [])
  useEffect(() => {
    window.addEventListener('files:libraries-updated', refresh)
    return () => window.removeEventListener('files:libraries-updated', refresh)
  }, [refresh])

  return {
    libraries,
    loading,
    loadFailed,
  }
}
