import fsp from 'node:fs/promises'
import path from 'node:path'
import { loadEnvFile } from 'node:process'
import { parseEnv } from 'node:util'
import envPaths from 'env-paths'
import { findUp } from 'find-up-simple'
import { z } from 'zod'
import ConfigStore from './ConfigStore.js'
import { type Config, schema } from './config.js'

export type { Config, ConfigStore }

export const configSchema = z.fromJSONSchema(
  schema as z.core.JSONSchema.JSONSchema,
)

// Configuration currently uses the Xon app-data directory and XON_CONFIG_FILE
// environment variable, even though this package is named @files/server.
const paths = envPaths('xon', {
  suffix: '',
})

export async function initConfig(): Promise<ConfigStore> {
  const envFile = await findUp('.env')
  let startingConfig: Partial<Config> = {}

  if (envFile) {
    loadEnvFile(envFile)
    startingConfig = (await parseEnvFile(envFile)) ?? {}
  }

  const configFilePath =
    process.env.XON_CONFIG_FILE ?? path.join(paths.data, 'config.json')
  await fsp.mkdir(path.dirname(configFilePath), { recursive: true })

  let savedConfig: Partial<Config> = {}
  try {
    savedConfig = JSON.parse(await fsp.readFile(configFilePath, 'utf-8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  // Precedence: schema/platform defaults < valid .env settings < saved settings.
  // Saved JSON is merged directly; only the .env settings are schema-validated.
  const data = {
    ...createDefaultsFromSchema(schema as JsonSchema),
    ...startingConfig,
    ...savedConfig,
  }
  await fsp.writeFile(configFilePath, JSON.stringify(data))
  return new ConfigStore(configFilePath, data)
}

/**
 * Creates an object from a JSON schema where:
 * - properties with a `default` use that value
 * - all other properties are `undefined`
 */
function createDefaultsFromSchema(json: JsonSchema): Config {
  if (json.type !== 'object' || !json.properties) {
    return {} as unknown as Config
  }

  const result: Record<string, unknown> = {}

  for (const [key, property] of Object.entries(json.properties)) {
    result[key] = getDefaultValue(property)
  }

  const config: Config = result as unknown as Config

  // These are defaults for separate, flat keys. Overriding appdata.path later
  // does not automatically relocate the cache, logs, or database paths.
  config['appdata.path'] = paths.data
  config['appdata.cachePath'] = path.join(paths.data, 'cache')
  config['appdata.logsPath'] = path.join(paths.data, 'logs')
  config['appdata.dbPath'] = path.join(paths.data, 'database')

  return config
}

function getDefaultValue(json: JsonSchema): unknown {
  // Explicit default always wins
  if ('default' in json) {
    return json.default
  }

  // Handle nested object schemas
  if (json.type === 'object' && json.properties) {
    return createDefaultsFromSchema(json)
  }

  // Handle arrays
  if (json.type === 'array') {
    return undefined
  }

  // Handle oneOf
  if (json.oneOf?.length) {
    const withDefault = json.oneOf.find((s) => 'default' in s)

    if (withDefault) {
      return withDefault.default
    }
  }

  return undefined
}

async function parseEnvFile(
  envFile: string,
): Promise<Partial<Config> | undefined> {
  try {
    const data = await fsp.readFile(envFile, 'utf-8')
    const raw = data.split('\n').reduce((acc, line) => {
      const parsed = parseEnv(line)

      if (parsed) {
        return { ...(acc ?? {}), ...parsed }
      }

      return acc
    }, {})

    // No coercion is applied to the strings returned by parseEnv. An invalid
    // .env contributes no config settings, though loadEnvFile already loaded it
    // into process.env for values such as XON_CONFIG_FILE.
    const parsed = configSchema.safeParse(raw)

    if (!parsed.success) {
      console.log('Failed to parse .env file')

      return
    }

    console.log('Successfully parsed .env file')

    return parsed.data as Partial<Config>
  } catch (error) {
    console.log('Failed to parse .env file', error)
  }
}

type JsonSchema = {
  type?: string
  default?: unknown
  readOnly?: boolean
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  oneOf?: JsonSchema[]
}
