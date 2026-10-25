import { useCallback, useMemo } from 'react'
import type { Settings, SettingsKey } from '../../settings/settings.js'
import { queryKeys } from '../queryClient.js'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

type SelectedSettings<Keys extends readonly SettingsKey[]> = Pick<
  Settings,
  Keys[number]
>

export function useSettings<const Keys extends readonly SettingsKey[]>(
  keys: Keys,
) {
  const api = useApi()
  const keySignature = keys.join('\0')

  // Treat equivalent key arrays as the same selection, including inline arrays.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keySignature represents the key array by value.
  const selectedKeys = useMemo(() => [...keys], [keySignature])
  const allowedKeys = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const queryKey = useMemo(
    () => queryKeys.settings(selectedKeys),
    [selectedKeys],
  )

  const request = useCallback(async () => {
    const entries = await Promise.all(
      selectedKeys.map(
        async (key) => [key, await api.settings.get(key)] as const,
      ),
    )

    return Object.fromEntries(entries) as SelectedSettings<Keys>
  }, [api, selectedKeys])

  const {
    data: values,
    setData: setValues,
    loading,
    loadFailed,
  } = useApiQuery<SelectedSettings<Keys> | undefined>(
    queryKey,
    request,
    undefined,
    { staleTime: Number.POSITIVE_INFINITY },
  )

  const updateSettings = useCallback(
    async <Key extends Keys[number]>(key: Key, value: Settings[Key]) => {
      if (!allowedKeys.has(key)) {
        throw new Error(`Setting key "${key}" was not requested by this hook`)
      }

      await api.settings.set(key, value)

      setValues(
        (current) => ({ ...current, [key]: value }) as SelectedSettings<Keys>,
      )

      window.dispatchEvent(
        new CustomEvent('filejam:settings-updated', {
          detail: { key, value },
        }),
      )
    },
    [allowedKeys, api, setValues],
  )

  return { values, updateSettings, loading, loadFailed }
}
