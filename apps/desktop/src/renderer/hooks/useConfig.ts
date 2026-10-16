import type { Config, ConfigKey } from '@files/server'
import { useCallback, useEffect, useMemo } from 'react'
import { useApi } from './useApi.js'
import { useApiQuery } from './useApiQuery.js'

type SelectedConfig<Keys extends readonly ConfigKey[]> = Pick<
  Config,
  Keys[number]
>

export function useConfig<const Keys extends readonly ConfigKey[]>(keys: Keys) {
  const api = useApi()
  const keySignature = keys.join('\0')

  // Treat equivalent key arrays as the same selection, including inline arrays.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keySignature represents the key array by value.
  const selectedKeys = useMemo(() => [...keys], [keySignature])
  const allowedKeys = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const request = useCallback(async () => {
    const entries = await Promise.all(
      selectedKeys.map(async (key) => [key, await api.config.get(key)] as const),
    )

    return Object.fromEntries(entries) as SelectedConfig<Keys>
  }, [api, selectedKeys])
  const {
    data: values,
    setData: setValues,
    loading,
    loadFailed,
  } = useApiQuery<SelectedConfig<Keys> | undefined>(request, undefined)

  useEffect(() => {
    const handleConfigUpdate = (event: Event) => {
      const { key, value } = (
        event as CustomEvent<{ key: ConfigKey; value: Config[ConfigKey] }>
      ).detail
      if (!allowedKeys.has(key)) return
      setValues(
        (current) =>
          ({ ...current, [key]: value }) as SelectedConfig<Keys>,
      )
    }

    window.addEventListener('files:config-updated', handleConfigUpdate)
    return () => {
      window.removeEventListener('files:config-updated', handleConfigUpdate)
    }
  }, [allowedKeys, setValues])

  const updateConfig = useCallback(
    async <Key extends Keys[number]>(key: Key, value: Config[Key]) => {
      if (!allowedKeys.has(key)) {
        throw new Error(`Config key "${key}" was not requested by this hook`)
      }

      await api.config.set(key, value)
      setValues(
        (current) =>
          ({ ...current, [key]: value }) as SelectedConfig<Keys>,
      )
      window.dispatchEvent(
        new CustomEvent('files:config-updated', { detail: { key, value } }),
      )
    },
    [allowedKeys, api, setValues],
  )

  return { values, updateConfig, loading, loadFailed }
}
