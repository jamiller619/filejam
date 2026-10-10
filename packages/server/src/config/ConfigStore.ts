import writeAtomic from 'write-file-atomic'
import type { Config, ConfigKey } from './config.js'

/** Persistent settings with literal dotted keys, such as "log.level". */
export default class ConfigStore {
  #data: Config
  #filePath: string
  #mutationQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string, savedConfig: Config) {
    this.#data = savedConfig
    this.#filePath = filePath
  }

  getStore(): Config {
    return {
      ...this.#data,
    }
  }

  /** Merge a partial update; restore the previous in-memory values if writing fails. */
  async setStore(data: Partial<Config>): Promise<void> {
    return this.#enqueue(async () => {
      const previous = { ...this.#data }
      Object.assign(this.#data, data)

      try {
        await this.#write()
      } catch (error) {
        this.#data = previous
        throw error
      }
    })
  }

  get<K extends ConfigKey>(key: K): Config[K] {
    return this.#data[key]
  }

  /** Passing undefined removes the key; it does not restore its schema default. */
  async set<K extends ConfigKey>(key: K, value?: Config[K]): Promise<void> {
    return this.#enqueue(async () => {
      const data = this.#data as unknown as Record<string, unknown>
      const hadPreviousValue = Object.hasOwn(data, key)
      const previousValue = data[key]

      if (value === undefined) delete data[key]
      else data[key] = value

      try {
        await this.#write()
      } catch (error) {
        if (hadPreviousValue) data[key] = previousValue
        else delete data[key]
        throw error
      }
    })
  }

  #enqueue(mutation: () => Promise<void>): Promise<void> {
    // Serialize the whole mutation, including rollback, so overlapping writes
    // cannot restore stale state over a newer update. Return the failure to its
    // caller while keeping the queue usable for subsequent updates.
    const result = this.#mutationQueue.then(mutation, mutation)
    this.#mutationQueue = result.catch(() => undefined)
    return result
  }

  async #write() {
    // Replace the file atomically so readers do not see partially written JSON.
    await writeAtomic(this.#filePath, JSON.stringify(this.#data, null, 2))
  }
}
