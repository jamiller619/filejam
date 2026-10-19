import type { ConfigKey } from '../config/config.js'
import { type Config, type ConfigStore, configSchema } from '../config/index.js'
import type { ZodObject, ZodType } from 'zod'

export function createConfigApi(store?: ConfigStore) {
  function requireStore(): ConfigStore {
    if (!store) {
      throw new Error('The config API is unavailable')
    }

    return store
  }

  return {
    async get<K extends ConfigKey>(key: K): Promise<Config[K]> {
      return requireStore().get(key)
    },
    async set<K extends ConfigKey>(key: K, value: Config[K]): Promise<void> {
      const config = requireStore()

      const configObjectSchema = configSchema as ZodObject<
        Record<ConfigKey, ZodType>
      >

      const parsed = configObjectSchema.shape[key].safeParse(value)

      if (!parsed.success) {
        throw new Error(`Invalid config value for "${key}"`)
      }

      await config.set(key, value)
    },
  }
}
