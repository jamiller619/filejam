import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSettingDefinitions,
  formatSettingValue,
  getSettingGroups,
} from '../dist/settings/definitions.js'
import {
  defaultSettings,
  schema,
  settingsKeys,
  validateSetting,
} from '../dist/settings/settings.js'

test('every schema entry supplies a valid default and is registered automatically', () => {
  assert.deepEqual(settingsKeys, Object.keys(schema.properties))

  for (const key of settingsKeys) {
    assert.deepEqual(
      validateSetting(key, defaultSettings[key]),
      schema.properties[key].default,
    )
  }
})

test('schema validation enforces enums, bounds, types, references and array uniqueness', () => {
  for (const [key, value] of [
    ['user.dateformat', 'invalid'],
    ['user.files.showExtensions', 'false'],
    ['user.files.showHidden', 'false'],
    ['user.files.showSystem', 1],
    ['window.navbarWidth', 119],
    ['window.navbarWidth', 160.5],
    ['window.detailsWidth', Infinity],
    ['window.main', { width: 0 }],
    ['window.main', { unexpected: true }],
    ['window.main', null],
    ['user.favoriteFolders', ['same', 'same']],
    ['user.favoriteFolders', [1]],
    ['user.dateformat', undefined],
  ]) {
    assert.throws(() => validateSetting(key, value), /Invalid setting value/)
  }

  assert.throws(() => validateSetting('toString', true), /Invalid setting key/)
  assert.deepEqual(validateSetting('window.main', { x: -100, width: 800 }), {
    x: -100,
    width: 800,
  })
})

test('new schema entries infer controls without a page registration', () => {
  const definitions = createSettingDefinitions({
    'user.enabled': { type: 'boolean', default: false },
    'user.label': { type: 'string', default: '', minLength: 2, maxLength: 20 },
    'user.count': { type: 'integer', default: 2, minimum: 1, maximum: 10 },
    'user.scale': { type: 'number', default: 1, multipleOf: 0.25 },
    'user.choice': {
      type: 'number',
      enum: [1, 2],
      default: 1,
      'x-ui': { category: 'files', optionLabels: { 1: 'Small' } },
    },
    'window.internal': {
      type: 'object',
      default: {},
      'x-ui': { hidden: true },
    },
  })

  assert.deepEqual(
    definitions.map(({ control }) => control),
    ['switch', 'text', 'number', 'number', 'select'],
  )
  assert.equal(definitions[1].minLength, 2)
  assert.equal(definitions[2].step, 1)
  assert.equal(definitions[2].maximum, 10)
  assert.equal(definitions[3].step, 0.25)
  assert.equal(definitions[4].category, 'files')
  assert.equal(definitions[4].options[0].value, 1)
  assert.equal(formatSettingValue(definitions[4], 1), 'Small')
  assert.equal(formatSettingValue(definitions[0], undefined), 'Off')
  assert.throws(
    () => createSettingDefinitions({ complex: { type: 'object' } }),
    /supported control/,
  )
})

test('settings groups exclude internal state and use schema category titles', () => {
  const groups = getSettingGroups()

  assert.equal(groups.length, 1)
  assert.equal(groups[0].title, 'User')
  assert.deepEqual(
    groups[0].settings.map(({ key }) => key),
    [
      'user.dateformat',
      'user.files.colorCoding',
      'user.files.showExtensions',
      'user.files.showHidden',
      'user.files.showSystem',
    ],
  )
})
