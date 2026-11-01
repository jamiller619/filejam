import { readFile, writeFile } from 'node:fs/promises'
import { Ajv } from 'ajv'
import { compile } from 'json-schema-to-typescript'

const schemaUrl = new URL(
  '../src/settings/settings.schema.json',
  import.meta.url,
)
const outputUrl = new URL('../src/settings/schema.ts', import.meta.url)
const schema = JSON.parse(await readFile(schemaUrl, 'utf8'))

// Every stored setting has a default, even when omitted from a saved file.
schema.required = Object.keys(schema.properties)

for (const [key, property] of Object.entries(schema.properties)) {
  if (!Object.hasOwn(property, 'default')) {
    throw new Error(`Setting "${key}" must declare a default`)
  }
}

const validate = new Ajv({ strict: true }).addKeyword('x-ui').compile(schema)
const defaults = Object.fromEntries(
  Object.entries(schema.properties).map(([key, property]) => [
    key,
    property.default,
  ]),
)

if (!validate(defaults)) {
  throw new Error(
    `Invalid settings defaults: ${JSON.stringify(validate.errors)}`,
  )
}

const source = await compile(schema, schema.title, {
  style: { singleQuote: true, semi: false, tabWidth: 2 },
})
const previous = await readFile(outputUrl, 'utf8').catch(() => '')

if (previous !== source) {
  await writeFile(outputUrl, source)
}
