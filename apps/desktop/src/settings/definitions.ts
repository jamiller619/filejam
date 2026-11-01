import type { SettingsKey } from './settings.js'
import schema from './settings.schema.json' with { type: 'json' }

export type SettingValue = string | number | boolean

export type SettingDefinition = {
  key: SettingsKey
  title: string
  description: string
  category: string
  control: 'switch' | 'select' | 'text' | 'number'
  defaultValue: SettingValue
  options: { value: SettingValue; label: string }[]
  minimum?: number
  maximum?: number
  step?: number | undefined
  minLength?: number
  maxLength?: number
  pattern?: string
}

type SettingProperty = {
  title?: string
  description?: string
  type?: string
  default?: unknown
  enum?: SettingValue[]
  minimum?: number
  maximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  'x-ui'?: {
    hidden?: boolean
    category?: string
    optionLabels?: Record<string, string>
  }
}

/** UI descriptors are independent of page layout and persistence. */
export function createSettingDefinitions(
  properties: Record<string, SettingProperty>,
) {
  return Object.entries(properties).flatMap(
    ([key, property]): SettingDefinition[] => {
      if (property['x-ui']?.hidden) {
        return []
      }

      const control = property.enum
        ? 'select'
        : property.type === 'boolean'
          ? 'switch'
          : property.type === 'string'
            ? 'text'
            : property.type === 'number' || property.type === 'integer'
              ? 'number'
              : null

      if (!control) {
        throw new Error(
          `Setting "${key}" needs a supported control or x-ui.hidden`,
        )
      }

      return [
        {
          key: key as SettingsKey,
          title: property.title ?? key,
          description: property.description ?? '',
          category: property['x-ui']?.category ?? key.split('.')[0] ?? 'other',
          control,
          defaultValue: property.default as SettingValue,
          options: (property.enum ?? []).map((value) => ({
            value,
            label:
              property['x-ui']?.optionLabels?.[String(value)] ?? String(value),
          })),
          ...(property.minimum !== undefined && { minimum: property.minimum }),
          ...(property.maximum !== undefined && { maximum: property.maximum }),
          ...(control === 'number' && {
            step:
              property.multipleOf ??
              (property.type === 'integer' ? 1 : undefined),
          }),
          ...(property.minLength !== undefined && {
            minLength: property.minLength,
          }),
          ...(property.maxLength !== undefined && {
            maxLength: property.maxLength,
          }),
          ...(property.pattern !== undefined && { pattern: property.pattern }),
        },
      ]
    },
  )
}

export const settingDefinitions = createSettingDefinitions(schema.properties)

export function getSettingDefinition(key: SettingsKey) {
  return settingDefinitions.find((setting) => setting.key === key)
}

export function getSettingGroups() {
  const categories = new Map(
    schema['x-ui'].categories.map(({ namespace, title }) => [namespace, title]),
  )

  for (const setting of settingDefinitions) {
    if (!categories.has(setting.category)) {
      categories.set(setting.category, setting.category)
    }
  }

  return [...categories].flatMap(([namespace, title]) => {
    const settings = settingDefinitions.filter(
      (setting) => setting.category === namespace,
    )

    return settings.length ? [{ namespace, title, settings }] : []
  })
}

export function formatSettingValue(setting: SettingDefinition, value: unknown) {
  const current = value ?? setting.defaultValue

  return (
    setting.options.find((option) => option.value === current)?.label ??
    (typeof current === 'boolean' ? (current ? 'On' : 'Off') : String(current))
  )
}
