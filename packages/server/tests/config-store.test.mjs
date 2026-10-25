import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import ConfigStore from '../dist/config/ConfigStore.js'

test('config store persists updates and replaces legacy data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'filejam-config-store-'))
  const file = join(directory, 'config.json')
  const initial = {
    'app.locale': 'en-US',
    'log.level': 'info',
    'log.retentionDays': 7,
    'appdata.path': directory,
    'appdata.dbPath': join(directory, 'database'),
    'appdata.cachePath': join(directory, 'cache'),
    'appdata.cacheQuota': 0,
    'appdata.logsPath': join(directory, 'logs'),
    'user.dateformat': 'relative',
  }
  const store = new ConfigStore(file, initial)

  try {
    await store.set('log.level', 'debug')
    assert.equal(store.get('log.level'), 'debug')

    const runtimeConfig = store.getStore()

    delete runtimeConfig['user.dateformat']

    await store.replaceStore(runtimeConfig)

    const saved = JSON.parse(await readFile(file, 'utf8'))

    assert.equal(saved['log.level'], 'debug')
    assert.equal(Object.hasOwn(saved, 'user.dateformat'), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
