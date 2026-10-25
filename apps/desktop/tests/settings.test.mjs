import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createSettingsApi, initSettings } from '../dist/settings/index.js'

test('desktop settings initialize defaults and persist valid updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-settings-'))

  try {
    const initialized = await initSettings(directory)
    const settings = createSettingsApi(initialized.store)

    assert.equal(initialized.created, true)
    assert.equal(await settings.get('user.dateformat'), 'relative')
    assert.equal(await settings.get('user.files.showExtensions'), false)
    assert.deepEqual(await settings.get('window.main'), {})

    await settings.set('user.dateformat', 'absolute')

    const saved = JSON.parse(
      await readFile(join(directory, 'settings.json'), 'utf8'),
    )

    assert.equal(saved['user.dateformat'], 'absolute')
    await assert.rejects(
      settings.set('window.navbarWidth', 300),
      /Invalid setting value/,
    )
    await assert.rejects(settings.get('server.secret'), /Invalid setting key/)
    assert.equal(await settings.get('window.navbarWidth'), 160)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('desktop settings migrate legacy values without replacing saved values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-settings-'))
  const settingsFile = join(directory, 'settings.json')

  try {
    await writeFile(
      settingsFile,
      JSON.stringify({
        'user.dateformat': 'absolute',
        'window.navbarWidth': 180,
      }),
    )

    const initialized = await initSettings(directory, {
      'user.dateformat': 'relative',
      'user.favoriteFolders': ['C:\\Pictures'],
      'window.navbarWidth': 200,
    })

    assert.equal(initialized.created, false)
    assert.deepEqual(initialized.legacyKeys, [
      'window.navbarWidth',
      'user.favoriteFolders',
      'user.dateformat',
    ])
    assert.deepEqual(initialized.migratedKeys, ['user.favoriteFolders'])
    assert.equal(initialized.store.get('user.dateformat'), 'absolute')
    assert.equal(initialized.store.get('user.files.showExtensions'), false)
    assert.equal(initialized.store.get('window.navbarWidth'), 180)
    assert.deepEqual(initialized.store.get('user.favoriteFolders'), [
      'C:\\Pictures',
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('desktop settings reject malformed persisted data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-settings-'))

  try {
    await writeFile(
      join(directory, 'settings.json'),
      JSON.stringify({ 'window.main': { width: -1 } }),
    )

    await assert.rejects(initSettings(directory), /Invalid setting value/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
