export { default as schema } from './settings.schema.json' with { type: 'json' }

import type { FilejamDesktopSettingsSchema, MainWindowState } from './schema.js'

export type Settings = FilejamDesktopSettingsSchema
export type WindowStateSetting = MainWindowState

export type SettingsKey = keyof Settings

export const settingsKeys = [
  'window.navbarWidth',
  'window.detailsWidth',
  'window.main',
  'window.imageViewer',
  'user.favoriteFolders',
  'user.dateformat',
  'user.files.showExtensions',
  'user.files.colorCoding',
] as const satisfies readonly SettingsKey[]

export const defaultSettings: Settings = {
  'window.navbarWidth': 160,
  'window.detailsWidth': 380,
  'window.main': {},
  'window.imageViewer': {},
  'user.favoriteFolders': [],
  'user.dateformat': 'relative',
  'user.files.showExtensions': false,
  'user.files.colorCoding': true,
}

export function assertSettingsKey(key: unknown): asserts key is SettingsKey {
  if (
    typeof key !== 'string' ||
    !(settingsKeys as readonly string[]).includes(key)
  ) {
    throw new Error(`Invalid setting key "${String(key)}"`)
  }
}

export function validateSetting<Key extends SettingsKey>(
  key: Key,
  value: unknown,
): Settings[Key] {
  assertSettingsKey(key)

  if (key === 'window.navbarWidth') {
    if (
      !Number.isInteger(value) ||
      (value as number) < 120 ||
      (value as number) > 250
    ) {
      throw new Error(`Invalid setting value for "${key}"`)
    }
  } else if (key === 'window.detailsWidth') {
    if (
      !Number.isInteger(value) ||
      (value as number) < 280 ||
      (value as number) > 600
    ) {
      throw new Error(`Invalid setting value for "${key}"`)
    }
  } else if (key === 'window.main' || key === 'window.imageViewer') {
    validateWindowState(key, value)
  } else if (key === 'user.favoriteFolders') {
    if (
      !Array.isArray(value) ||
      value.some((path) => typeof path !== 'string') ||
      new Set(value).size !== value.length
    ) {
      throw new Error(`Invalid setting value for "${key}"`)
    }
  } else if (key === 'user.dateformat') {
    if (value !== 'relative' && value !== 'absolute') {
      throw new Error(`Invalid setting value for "${key}"`)
    }
  } else if (typeof value !== 'boolean') {
    throw new Error(`Invalid setting value for "${key}"`)
  }

  return value as Settings[Key]
}

function validateWindowState(key: SettingsKey, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid setting value for "${key}"`)
  }

  const state = value as Record<string, unknown>
  const allowedKeys = new Set([
    'x',
    'y',
    'width',
    'height',
    'maximized',
    'fullscreen',
  ])

  if (Object.keys(state).some((property) => !allowedKeys.has(property))) {
    throw new Error(`Invalid setting value for "${key}"`)
  }

  if (
    (state.x !== undefined && !Number.isInteger(state.x)) ||
    (state.y !== undefined && !Number.isInteger(state.y)) ||
    (state.width !== undefined &&
      (!Number.isInteger(state.width) || (state.width as number) < 1)) ||
    (state.height !== undefined &&
      (!Number.isInteger(state.height) || (state.height as number) < 1)) ||
    (state.maximized !== undefined && typeof state.maximized !== 'boolean') ||
    (state.fullscreen !== undefined && typeof state.fullscreen !== 'boolean')
  ) {
    throw new Error(`Invalid setting value for "${key}"`)
  }
}
