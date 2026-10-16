import { useEffect, useState } from 'react'

/** Pass a stable callback (useCallback) so rendering does not restart requests. */
export function useApiQuery<T>(request: () => Promise<T>, initialData: T) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const [refresh] = useState(() => () => setRevision((value) => value + 1))

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly refreshes the request.
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadFailed(false)
    // Also handle synchronous errors thrown by the preload bridge.
    void Promise.resolve()
      .then(request)
      .then(
        (result) => {
          if (!active) return
          setData(result)
          setLoading(false)
        },
        () => {
          if (!active) return
          setLoadFailed(true)
          setLoading(false)
        },
      )
    return () => {
      active = false
    }
  }, [request, revision])

  return { data, setData, loading, loadFailed, refresh }
}
