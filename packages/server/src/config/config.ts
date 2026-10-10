export { default as schema } from './config.schema.json' with { type: 'json' }

import type { FilesAppConfigSchema } from './schema.js'

export type ConfigKey = keyof FilesAppConfigSchema
export type Config = FilesAppConfigSchema
