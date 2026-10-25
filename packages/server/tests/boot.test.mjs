import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { setTimeout } from 'node:timers/promises'
import * as server from '../dist/index.js'

test('boot owns initialization, concurrent startup, shutdown, and restart', async () => {
  assert.deepEqual(Object.keys(server), ['boot'])

  const directory = await mkdtemp(join(tmpdir(), 'filejam-boot-'))
  const previous = process.env.FILEJAM_CONFIG_FILE
  const configFile = join(directory, 'config.json')

  process.env.FILEJAM_CONFIG_FILE = configFile

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

    const desktop = join(directory, 'Desktop')
    const documents = join(directory, 'Documents')

    await mkdir(desktop)
    await mkdir(documents)
    await writeFile(join(desktop, 'desktop.txt'), 'desktop')
    await writeFile(join(documents, 'document.txt'), 'document')

    const first = server.boot({
      resolveDefaultFolder: (folder) =>
        folder === 'desktop' ? desktop : documents,
    })

    assert.equal(server.boot(), first)
    instance = await first
    assert.equal((await instance.api.libraries.list()).length, 2)
    assert.equal('db' in instance, false)
    await waitForIndexed(instance, 'Desktop', 'desktop.txt')
    await waitForIndexed(instance, 'Documents', 'document.txt')
    await mkdir(join(desktop, 'nested'))
    await writeFile(join(desktop, 'nested', 'live.txt'), 'live')
    await waitForIndexed(instance, 'Desktop', 'nested/live.txt')

    await rename(
      join(desktop, 'nested', 'live.txt'),
      join(desktop, 'moved.txt'),
    )

    await waitForIndexed(instance, 'Desktop', 'moved.txt')
    await waitForAbsent(instance, 'Desktop', 'nested/live.txt')
    await rm(join(desktop, 'moved.txt'))
    await waitForAbsent(instance, 'Desktop', 'moved.txt')
    // Persist an unavailable library before valid roots to verify failure does
    // not prevent the rest of the startup batch from running on restart.
    await instance.api.libraries.ensureRoot(join(directory, '000-missing'))
    instance.logger.info('boot test log')
    await Promise.all([instance.close(), instance.close()])

    assert.match(
      await readFile(join(directory, 'logs/current.jsonl'), 'utf8'),
      /boot test log/,
    )

    await writeFile(join(desktop, 'new.txt'), 'new')
    await writeFile(join(documents, 'new.txt'), 'new')

    // No resolver on restart: scan the libraries already in the database.
    const restarted = await server.boot()

    assert.notEqual(restarted, instance)
    instance = restarted
    await waitForIndexed(instance, 'Desktop', 'new.txt')
    await waitForIndexed(instance, 'Documents', 'new.txt')
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

async function waitForAbsent(instance, name, path) {
  const library = (await instance.api.libraries.list()).find(
    (item) => item.name === name,
  )

  for (let attempt = 0; attempt < 1000; attempt++) {
    const entries = await instance.api.entries.listPaths(library.id)

    if (!entries.some((entry) => entry.path === path)) {
      return
    }

    await setTimeout(10)
  }

  assert.fail(`Watcher did not remove ${name}/${path}`)
}

async function waitForIndexed(instance, name, path) {
  const library = (await instance.api.libraries.list()).find(
    (item) => item.name === name,
  )

  assert.ok(library)

  for (let attempt = 0; attempt < 500; attempt++) {
    const entries = await instance.api.entries.listPaths(library.id)

    if (entries.some((entry) => entry.path === path)) {
      return
    }

    await setTimeout(10)
  }

  assert.fail(`Startup did not index ${name}/${path}`)
}
