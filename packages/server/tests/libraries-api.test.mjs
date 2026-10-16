import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createApi } from '../dist/api/index.js'
import { initDatabase } from '../dist/db/index.js'
import { libraries } from '../dist/db/schemas/library.js'

test('libraries API returns plain records in stable order, including an empty database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'files-libraries-api-'))
  let connection
  try {
    connection = await initDatabase(join(directory, 'files.sqlite'))
    const api = createApi(connection.db)
    assert.deepEqual(await api.libraries.list(), [])
    const records = [
      { id: 3, name: 'Videos', rootPath: '/videos' },
      { id: 2, name: 'Documents', rootPath: '/documents-2' },
      { id: 1, name: 'Documents', rootPath: '/documents-1' },
    ]
    await connection.db.insert(libraries).values(records)
    const result = await api.libraries.list()
    assert.deepEqual(result, [records[2], records[1], records[0]])
    assert.deepEqual(structuredClone(result), result)
    // Scanning an existing root must retain the user's library name and ID.
    assert.deepEqual(await api.libraries.ensureRoot('/documents-1'), records[2])
    const root = join(directory, 'new-library')
    const created = await api.libraries.ensureRoot(root)
    assert.equal(created.name, 'new-library')
    assert.equal(created.rootPath, root)
    assert.deepEqual(await api.libraries.ensureRoot(root), created)
    assert.equal((await api.libraries.list()).length, 4)
  } finally {
    connection?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
