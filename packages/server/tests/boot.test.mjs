import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as server from '../dist/index.js'

test('boot registers volumes and exposes live folder contents', async () => {
  assert.deepEqual(Object.keys(server), ['boot'])

  const directory = await mkdtemp(join(tmpdir(), 'filejam-boot-'))
  const previous = process.env.FILEJAM_CONFIG_FILE
  const configFile = join(directory, 'config.json')
  const rootPath = join(directory, 'volume')

  process.env.FILEJAM_CONFIG_FILE = configFile

  let instance

  try {
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
    await mkdir(rootPath)
    await writeFile(join(rootPath, 'example.txt'), 'hello')

    const first = server.boot({
      volumes: [{ name: 'Test', rootPath, kind: 'system' }],
    })

    assert.equal(server.boot(), first)
    instance = await first

    const [volume] = await instance.api.volumes.list()
    const listing = await instance.api.entries.listChildren({
      volumeId: volume.id,
      relativePath: '',
    })

    assert.deepEqual(
      listing.entries.map((entry) => entry.name),
      ['example.txt'],
    )

    instance.logger.info('boot test log')
    await Promise.all([instance.close(), instance.close()])

    assert.match(
      await readFile(join(directory, 'logs/current.jsonl'), 'utf8'),
      /boot test log/,
    )
  } finally {
    await instance?.close()

    if (previous === undefined) {
      delete process.env.FILEJAM_CONFIG_FILE
    } else {
      process.env.FILEJAM_CONFIG_FILE = previous
    }

    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
})
