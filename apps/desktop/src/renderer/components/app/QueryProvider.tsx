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

    const invalidateConfig = () => {
      void queryClient.invalidateQueries({ queryKey: ['config'] })
    }

    const invalidateFiles = () => {
      void queryClient.invalidateQueries({ queryKey: ['files'] })
    }

    window.addEventListener('files:libraries-updated', invalidateLibraries)
    window.addEventListener('collections-changed', invalidateCollections)
    window.addEventListener('files:config-updated', invalidateConfig)
    const unsubscribeScanner = window.scanner.onUpdated(invalidateFiles)

    return () => {
      window.removeEventListener('files:libraries-updated', invalidateLibraries)
      window.removeEventListener('collections-changed', invalidateCollections)
      window.removeEventListener('files:config-updated', invalidateConfig)
      unsubscribeScanner()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
