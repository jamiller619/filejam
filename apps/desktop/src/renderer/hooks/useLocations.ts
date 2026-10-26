import { useCallback } from 'react'
import { queryKeys } from '../queryClient.js'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

export function useLocations() {
  const api = useApi()
  const request = useCallback(() => api.locations.list(), [api])
  const result = useApiQuery(queryKeys.locations, request, [], {
    staleTime: 5_000,
  })

  return { ...result, locations: result.data }
}
