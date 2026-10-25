import fsp from 'node:fs/promises'
import path from 'node:path'
import { SettingsStore } from './SettingsStore.js'
import {
  assertSettingsKey,
  defaultSettings,
  type Settings,
  type SettingsKey,
  settingsKeys,
  validateSetting,
} from './settings.js'

export type { Settings, SettingsKey, SettingsStore }

export type SettingsApi = ReturnType<typeof createSettingsApi>

export async function initSettings(
  userDataPath: string,
  legacyConfig: Record<string, unknown> = {},
) {
  const filePath = path.join(userDataPath, 'settings.json')

  await fsp.mkdir(userDataPath, { recursive: true })

  let savedSettings: Record<string, unknown> = {}
  let created = false

  try {
    const parsed: unknown = JSON.parse(await fsp.readFile(filePath, 'utf-8'))

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Settings must be a JSON object')
    }

    savedSettings = parsed as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    created = true
  }

  const knownKeys = new Set<string>(settingsKeys)

  if (Object.keys(savedSettings).some((key) => !knownKeys.has(key))) {
    throw new Error('Settings contain an unknown key')
  }

  const data = { ...defaultSettings }
  const migratedKeys: SettingsKey[] = []
  const legacyKeys = settingsKeys.filter((key) =>
    Object.hasOwn(legacyConfig, key),
  )

  for (const key of settingsKeys) {
    if (Object.hasOwn(savedSettings, key)) {
      data[key] = validateSetting(key, savedSettings[key]) as never
    } else if (Object.hasOwn(legacyConfig, key)) {
      data[key] = validateSetting(key, legacyConfig[key]) as never
      migratedKeys.push(key)
    }
  }

  const store = new SettingsStore(filePath, data)

  await store.write()

  return { store, created, legacyKeys, migratedKeys }
}

export function createSettingsApi(store: SettingsStore) {
  return {
    async get<Key extends SettingsKey>(key: Key): Promise<Settings[Key]> {
      assertSettingsKey(key)

      return store.get(key)
    },
    async set<Key extends SettingsKey>(
      key: Key,
      value: Settings[Key],
    ): Promise<void> {
      await store.set(key, validateSetting(key, value))
    },
  }
}
