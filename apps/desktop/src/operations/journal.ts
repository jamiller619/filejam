import { DatabaseSync } from 'node:sqlite'
import type { FileOperation, OperationItem } from './types.js'

/** Constant-size item checkpoints; a large selection is inserted in one transaction. */
export class OperationJournal {
  #database: DatabaseSync
  #known = new Set<string>()

  constructor(path: string) {
    this.#database = new DatabaseSync(path)
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items (
        operation_id TEXT NOT NULL, source TEXT NOT NULL, position INTEGER NOT NULL,
        data TEXT NOT NULL, PRIMARY KEY (operation_id, source)
      );
    `)
  }

  load(): FileOperation[] {
    const operations = this.#database
      .prepare('SELECT id, data FROM operations')
      .all()
    const items = this.#database.prepare(
      'SELECT data FROM items WHERE operation_id = ? ORDER BY position',
    )

    return operations.map((row) => {
      const operation = JSON.parse(String(row.data)) as FileOperation
      operation.items = items
        .all(String(row.id))
        .map((item) => JSON.parse(String(item.data)) as OperationItem)
      this.#known.add(operation.id)

      return operation
    })
  }

  save(operation: FileOperation, item?: OperationItem) {
    const { items, ...metadata } = operation
    const selected = item && this.#known.has(operation.id) ? [item] : items
    const writeItem = this.#database.prepare(
      'INSERT INTO items (operation_id, source, position, data) VALUES (?, ?, ?, ?) ON CONFLICT(operation_id, source) DO UPDATE SET data = excluded.data',
    )
    this.#database.exec('BEGIN IMMEDIATE')

    try {
      this.#database
        .prepare(
          'INSERT INTO operations (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        )
        .run(operation.id, JSON.stringify(metadata))

      for (const entry of selected) {
        writeItem.run(
          operation.id,
          entry.source,
          entry.sequence ?? 0,
          JSON.stringify(entry),
        )
      }

      this.#database.exec('COMMIT')
      this.#known.add(operation.id)
    } catch (error) {
      this.#database.exec('ROLLBACK')

      throw error
    }
  }

  close() {
    this.#database.close()
  }
}
