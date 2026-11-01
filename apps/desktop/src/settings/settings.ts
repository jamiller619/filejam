import { Ajv } from 'ajv'
import type { FilejamDesktopSettingsSchema, MainWindowState } from './schema.js'
import schema from './settings.schema.json' with { type: 'json' }

export { schema }
export type Settings = FilejamDesktopSettingsSchema
export type WindowStateSetting = MainWindowState
export type SettingsKey = keyof Settings

export const settingsKeys = Object.keys(schema.properties) as SettingsKey[]
export const defaultSettings = Object.fromEntries(
  settingsKeys.map((key) => [
    key,
    structuredClone(schema.properties[key].default),
  ]),
) as unknown as Settings

// Compile once in the main process. UI metadata is an annotation, not validation.
const validator = new Ajv({ strict: true }).addKeyword('x-ui')
const validate = validator.compile({ ...schema, required: [] })

export function assertSettingsKey(key: unknown): asserts key is SettingsKey {
  if (typeof key !== 'string' || !Object.hasOwn(schema.properties, key)) {
    throw new Error(`Invalid setting key "${String(key)}"`)
  }
}

export function validateSetting<Key extends SettingsKey>(
  key: Key,
  value: unknown,
): Settings[Key] {
  assertSettingsKey(key)

  if (value === undefined || !validate({ [key]: value })) {
    throw new Error(`Invalid setting value for "${key}"`)
  }

  return value as Settings[Key]
}
