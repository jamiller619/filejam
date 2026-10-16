import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createConfigApi } from '../dist/api/config.js'
import ConfigStore from '../dist/config/ConfigStore.js'

test('config API reads, validates, and persists config values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-config-api-'))
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
    'user.favoriteFolders': [],
  })
  const config = createConfigApi(store)

  try {
    assert.deepEqual(await config.get('user.favoriteFolders'), [])

    await config.set('user.favoriteFolders', [2, 5])
    assert.deepEqual(await config.get('user.favoriteFolders'), [2, 5])
    assert.deepEqual(
      JSON.parse(await readFile(file, 'utf8'))['user.favoriteFolders'],
      [2, 5],
    )

    await assert.rejects(
      config.set('user.favoriteFolders', [2, 2]),
      /Invalid config value/,
    )
    assert.deepEqual(await config.get('user.favoriteFolders'), [2, 5])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
