import type { Locations } from '../../browser/locations.js'
import { useApiQuery } from './useApiQuery.js'

export function useLocations() {
  return useApiQuery<Locations | null>(
    ['locations'],
    () => {
      if (!window.locations) {
        throw new Error('Locations bridge is unavailable')
      }
      return window.locations.get()
    },
    null,
  )
}
