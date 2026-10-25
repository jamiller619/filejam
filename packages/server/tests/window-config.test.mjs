import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createConfigApi } from '../dist/api/config.js'
import ConfigStore from '../dist/config/ConfigStore.js'

test('config API validates and persists window state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-window-config-'))
  const file = join(directory, 'config.json')
  const store = new ConfigStore(file, {
    'app.locale': 'en-US',
    'log.level': 'info',
    'log.retentionDays': 7,
    'appdata.path': directory,
    'appdata.dbPath': join(directory, 'database'),
    'appdata.cachePath': join(directory, 'cache'),
    'appdata.cacheQuota': 0,
    'appdata.logsPath': join(directory, 'logs'),
    'window.navbarWidth': 160,
    'window.detailsWidth': 380,
    'window.main': {},
    'window.imageViewer': {},
    'user.favoriteFolders': [],
  })
  const config = createConfigApi(store)
  const state = {
    x: -1200,
    y: 50,
    width: 1100,
    height: 760,
    maximized: true,
    fullscreen: false,
  }

  try {
    await config.set('window.main', state)

    assert.deepEqual(await config.get('window.main'), state)
    assert.deepEqual(
      JSON.parse(await readFile(file, 'utf8'))['window.main'],
      state,
    )
    await assert.rejects(
      config.set('window.main', { width: -1 }),
      /Invalid config value/,
    )
    await assert.rejects(
      config.set('window.navbarWidth', 300),
      /Invalid config value/,
    )
    await assert.rejects(
      config.set('window.detailsWidth', 700),
      /Invalid config value/,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
