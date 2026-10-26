import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { queryClient, queryKeys } from '../../queryClient.js'

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    const invalidateVolumes = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.volumes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations })
    }

    const invalidateCollections = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections })
      void queryClient.invalidateQueries({ queryKey: ['entry-collections'] })
    }

    const invalidateSettings = () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    }

    const invalidateFiles = () => {
      void queryClient.invalidateQueries({ queryKey: ['files'] })
    }

    window.addEventListener('filejam:volumes-updated', invalidateVolumes)
    window.addEventListener('collections-changed', invalidateCollections)
    window.addEventListener('filejam:settings-updated', invalidateSettings)
    const unsubscribeScanner = window.scanner.onUpdated(invalidateFiles)
    const volumeRefresh = window.setInterval(invalidateVolumes, 5_000)

    return () => {
      window.removeEventListener('filejam:volumes-updated', invalidateVolumes)
      window.removeEventListener('collections-changed', invalidateCollections)
      window.removeEventListener('filejam:settings-updated', invalidateSettings)
      unsubscribeScanner()
      window.clearInterval(volumeRefresh)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
