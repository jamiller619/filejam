import type { ConfigKey } from '../config/config.js'
import { type Config, type ConfigStore, configSchema } from '../config/index.js'

export function createConfigApi(store?: ConfigStore) {
  function requireStore(): ConfigStore {
    if (!store) throw new Error('The config API is unavailable')
    return store
  }

  return {
    async get<K extends ConfigKey>(key: K): Promise<Config[K]> {
      return requireStore().get(key)
    },
    async set<K extends ConfigKey>(key: K, value: Config[K]): Promise<void> {
      const config = requireStore()
      const candidate = { ...config.getStore(), [key]: value }
      const parsed = configSchema.safeParse(candidate)

      if (!parsed.success) {
        throw new Error(`Invalid config value for "${key}"`)
      }

      await config.set(key, value)
    },
  }
}
