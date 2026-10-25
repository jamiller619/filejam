import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { queryClient, queryKeys } from '../../queryClient.js'

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  useEffect(() => {
    const invalidateLibraries = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.libraries })
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

    window.addEventListener('filejam:libraries-updated', invalidateLibraries)
    window.addEventListener('collections-changed', invalidateCollections)
    window.addEventListener('filejam:settings-updated', invalidateSettings)
    const unsubscribeScanner = window.scanner.onUpdated(invalidateFiles)

    return () => {
      window.removeEventListener(
        'filejam:libraries-updated',
        invalidateLibraries,
      )
      window.removeEventListener('collections-changed', invalidateCollections)
      window.removeEventListener('filejam:settings-updated', invalidateSettings)
      unsubscribeScanner()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
