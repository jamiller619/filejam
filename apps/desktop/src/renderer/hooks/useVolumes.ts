import { useCallback } from 'react'
import { queryKeys } from '../queryClient.js'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

export function useVolumes() {
  const api = useApi()
  const request = useCallback(() => api.volumes.list(), [api])
  const result = useApiQuery(queryKeys.volumes, request, [], {
    staleTime: 5_000,
  })

  return { ...result, volumes: result.data }
}
