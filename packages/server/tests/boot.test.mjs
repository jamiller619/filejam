import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as server from '../dist/index.js'

test('boot owns initialization, concurrent startup, shutdown, and restart', async () => {
  assert.deepEqual(Object.keys(server), ['boot'])
  const directory = await mkdtemp(join(tmpdir(), 'files-boot-'))
  const previous = process.env.XON_CONFIG_FILE
  const configFile = join(directory, 'config.json')
  process.env.XON_CONFIG_FILE = configFile
  let instance
  try {
    // A failed boot must release resources and allow a retry.
    await writeFile(configFile, '{')
    await assert.rejects(server.boot(), SyntaxError)
    await writeFile(
      configFile,
      JSON.stringify({
        'appdata.dbPath': join(directory, 'db'),
        'appdata.logsPath': join(directory, 'logs'),
        'appdata.cachePath': join(directory, 'cache'),
      }),
    )
    const first = server.boot()
    assert.equal(server.boot(), first)
    instance = await first
    assert.equal((await instance.scanner.status()).state, 'idle')
    await instance.db.run('SELECT 1')
    instance.logger.info('boot test log')
    await Promise.all([instance.close(), instance.close()])
    assert.match(
      await readFile(join(directory, 'logs/current.jsonl'), 'utf8'),
      /boot test log/,
    )
    const restarted = await server.boot()
    assert.notEqual(restarted, instance)
    instance = restarted
  } finally {
    await instance?.close()
    if (previous === undefined) delete process.env.XON_CONFIG_FILE
    else process.env.XON_CONFIG_FILE = previous
    await rm(directory, { recursive: true, force: true })
  }
})
