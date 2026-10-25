import type { Settings, SettingsKey } from './settings.js'
import { writeAtomic } from './writeAtomic.js'

export class SettingsStore {
  #data: Settings
  #filePath: string
  #mutationQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string, settings: Settings) {
    this.#data = settings
    this.#filePath = filePath
  }

  getStore(): Settings {
    return { ...this.#data }
  }

  get<Key extends SettingsKey>(key: Key): Settings[Key] {
    return this.#data[key]
  }

  async set<Key extends SettingsKey>(
    key: Key,
    value: Settings[Key],
  ): Promise<void> {
    return this.#enqueue(async () => {
      const previousValue = this.#data[key]

      this.#data[key] = value

      try {
        await this.#write()
      } catch (error) {
        this.#data[key] = previousValue

        throw error
      }
    })
  }

  async write(): Promise<void> {
    return this.#enqueue(() => this.#write())
  }

  #enqueue(mutation: () => Promise<void>): Promise<void> {
    const result = this.#mutationQueue.then(mutation, mutation)

    this.#mutationQueue = result.catch(() => undefined)

    return result
  }

  async #write(): Promise<void> {
    await writeAtomic(this.#filePath, JSON.stringify(this.#data, null, 2))
  }
}
