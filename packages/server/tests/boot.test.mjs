import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import * as server from '../dist/index.js'

async function waitForScan(scanner) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const status = await scanner.status()

    if (status.state !== 'scanning') {
      return status
    }

    await setTimeout(10)
  }

  throw new Error('Startup scan timed out')
}

test('boot registers volumes and exposes live folder contents', async () => {
  assert.deepEqual(Object.keys(server), ['boot'])

  const directory = await mkdtemp(join(tmpdir(), 'filejam-boot-'))
  const previous = process.env.FILEJAM_CONFIG_FILE
  const configFile = join(directory, 'config.json')
  const rootPath = join(directory, 'volume')
  const networkPath = join(directory, 'network')

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
    await mkdir(join(rootPath, 'nested'), { recursive: true })
    await mkdir(networkPath)
    await writeFile(join(rootPath, 'example.txt'), 'hello')
    await writeFile(join(rootPath, 'nested', 'child.txt'), 'world')
    await writeFile(join(networkPath, 'remote.txt'), 'deferred')

    const first = server.boot({
      volumes: [
        { name: 'Test', rootPath, kind: 'system' },
        { name: 'Network', rootPath: networkPath, kind: 'network' },
      ],
    })

    assert.equal(server.boot(), first)
    instance = await first

    const scan = await waitForScan(instance.scanner)
    const volume = (await instance.api.volumes.list()).find(
      (candidate) => candidate.rootPath === rootPath,
    )

    assert.ok(volume)
    assert.equal(scan.state, 'completed')
    assert.deepEqual(
      scan.roots.map((root) => root.root),
      [rootPath],
    )
    assert.deepEqual(await instance.scanner.results(rootPath), {
      added: [],
      changed: [],
      removed: [],
    })

    const listing = await instance.api.entries.listChildren({
      volumeId: volume.id,
      relativePath: '',
    })

    assert.deepEqual(
      listing.entries.map((entry) => entry.name),
      ['nested', 'example.txt'],
    )
    assert.equal(
      listing.entries.find((entry) => entry.name === 'nested').size,
      5,
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
