export { default as schema } from './config.schema.json' with { type: 'json' }

import type { FilejamAppConfigSchema } from './schema.js'

export type ConfigKey = keyof FilejamAppConfigSchema

export type Config = FilejamAppConfigSchema
