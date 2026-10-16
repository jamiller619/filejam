import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { createApi } from '../dist/api/index.js'
import { initDatabase } from '../dist/db/index.js'
import { embeddedTagsFromMetadata } from '../dist/metadata/readTags.js'
import { openScanDatabase } from '../dist/scanner/persistence.js'

const exec = promisify(execFile)
const xmp = (tags) =>
  `<?xml version="1.0"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag>${tags.map((tag) => `<rdf:li>${tag}</rdf:li>`).join('')}</rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>`

test('keyword extraction merges metadata groups without treating other EXIF fields as tags', () => {
  assert.deepEqual(
    embeddedTagsFromMetadata({
      'IPTC:Keywords': ['travel', ' family ', 'travel'],
      'XMP-dc:Subject': ['family', 'New York, NY'],
      'IFD0:XPKeywords': 'vacation; summer',
      'EXIF:Make': 'Canon',
      'XMP:Subject': 5,
    }),
    ['travel', 'family', 'New York, NY', 'vacation', 'summer'],
  )
})

test('scanning imports real embedded and Linux tags, refreshes metadata, and preserves app tags', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-tags-'))
  const file = join(directory, 'keywords.xmp')
  const databasePath = join(directory, 'files.sqlite')
  let connection
  let scan
  try {
    await writeFile(file, xmp(['shared', 'embedded']))
    if (process.platform === 'linux') {
      await exec('python3', [
        '-c',
        "import os,sys; os.setxattr(sys.argv[1], 'user.xdg.tags', b'shared,os tag')",
        file,
      ])
    }
    scan = await openScanDatabase(databasePath, directory)
    await scan.prepareTags([directory, file])
    await scan.save(directory)
    await scan.save(file)
    await scan.complete()
    connection = await initDatabase(databasePath)
    const api = createApi(connection.db)
    const [library] = await api.libraries.list()
    const folder = { libraryId: library.id, relativePath: '' }
    let [entry] = (await api.entries.listChildren(folder)).entries
    assert.deepEqual(entry.embeddedTags, ['shared', 'embedded'])
    if (process.platform === 'linux')
      assert.deepEqual(entry.osTags, ['shared', 'os tag'])
    assert.equal(entry.tagReadError, null)
    assert.equal(entry.size, (await stat(file)).size)
    assert.equal(entry.modifiedAt.getTime(), (await stat(file)).mtime.getTime())
    await api.entries.setAppTags(entry.id, [' personal ', 'shared', 'personal'])
    await assert.rejects(
      api.entries.setAppTags(entry.id, [42]),
      /Invalid file tags/,
    )
    await assert.rejects(api.entries.setAppTags(999999, []), /File not found/)
    await writeFile(file, xmp(['replacement']))
    if (process.platform === 'linux') {
      await exec('python3', [
        '-c',
        "import os,sys; os.removexattr(sys.argv[1], 'user.xdg.tags')",
        file,
      ])
    }
    await scan.save(file)
    ;[entry] = (await api.entries.listChildren(folder)).entries
    assert.deepEqual(entry.appTags, ['personal', 'shared'])
    assert.deepEqual(entry.embeddedTags, ['replacement'])
    if (process.platform === 'linux') assert.deepEqual(entry.osTags, [])
    assert.deepEqual(entry.tags, [
      'personal',
      'shared',
      ...entry.osTags,
      'replacement',
    ])
    // Corrupt embedded metadata preserves the last good imported tags.
    await writeFile(file, 'not valid XMP metadata')
    await scan.save(file)
    ;[entry] = (await api.entries.listChildren(folder)).entries
    assert.deepEqual(entry.embeddedTags, ['replacement'])
    assert.deepEqual(entry.appTags, ['personal', 'shared'])
    assert.match(entry.tagReadError, /Embedded tags:/)
  } finally {
    await scan?.close()
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('tag migration upgrades an existing database without losing files', async () => {
  const { mkdir, readFile, copyFile } = await import('node:fs/promises')
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const { pathToFileURL } = await import('node:url')
  const directory = await mkdtemp(join(tmpdir(), 'files-tags-upgrade-'))
  const path = join(directory, 'existing.sqlite')
  const oldMigrations = join(directory, 'migrations')
  const client = createClient({ url: pathToFileURL(path).href })
  let connection
  try {
    await mkdir(join(oldMigrations, 'meta'), { recursive: true })
    const source = new URL('../src/db/migrations/', import.meta.url)
    const journal = JSON.parse(
      await readFile(new URL('meta/_journal.json', source), 'utf8'),
    )
    journal.entries = journal.entries.slice(0, 2)
    await writeFile(
      join(oldMigrations, 'meta/_journal.json'),
      JSON.stringify(journal),
    )
    for (const migration of journal.entries) {
      await copyFile(
        new URL(`${migration.tag}.sql`, source),
        join(oldMigrations, `${migration.tag}.sql`),
      )
    }
    await migrate(drizzle(client), { migrationsFolder: oldMigrations })
    await client.execute(
      "INSERT INTO libraries (id, name, root_path) VALUES (1, 'Old library', '/old')",
    )
    await client.execute(
      "INSERT INTO entries (id, library_id, name, relative_path, kind, indexed_at) VALUES (1, 1, 'old.txt', 'old.txt', 'file', 0)",
    )
    client.close()
    connection = await initDatabase(path)
    const { entries } = await import('../dist/db/schemas/entry.js')
    const [entry] = await connection.db.select().from(entries)
    assert.equal(entry.name, 'old.txt')
    assert.deepEqual(entry.appTags, [])
    assert.deepEqual(entry.osTags, [])
    assert.deepEqual(entry.embeddedTags, [])
    assert.equal(entry.tagReadError, null)
  } finally {
    client.close()
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
