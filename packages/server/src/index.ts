import { join } from 'node:path'
import { createApi } from './api/index.js'
import type { VolumeInput } from './api/volumes.js'
import { initConfig } from './config/index.js'
import { initDatabase } from './db/index.js'
import { closeLogger, createLogger, initLogger } from './logger.js'
import { FileScanner } from './scanner/index.js'

// Keep the startup promise so callers also share initialization while it is in flight.
let running: ReturnType<typeof start> | undefined

type BootOptions = {
  volumes?: VolumeInput[]
  trashRoots?: string[]
}

export type { ServerApi, Volume } from './api/index.js'
export type { VolumeInput } from './api/volumes.js'
export type {
  CollectionDefinition,
  CollectionField,
  CollectionOperator,
  CollectionRule,
  CollectionSort,
} from './collections/definition.js'
export type { Config, ConfigKey } from './config/config.js'

/** Initialize the server once; concurrent callers share the same instance. */
export function boot(options: BootOptions = {}) {
  running ??= start(options).catch((error: unknown) => {
    // A failed boot must not prevent a later retry.
    running = undefined

    throw error
  })

  return running
}

async function start(options: BootOptions) {
  const config = await initConfig()

  await initLogger(config)

  const logger = createLogger('server')

  let database: Awaited<ReturnType<typeof initDatabase>> | undefined
  let scanner: FileScanner | undefined

  try {
    const databasePath = join(config.get('appdata.dbPath'), 'filejam.sqlite')

    database = await initDatabase(databasePath)

    const api = createApi(database.db)
    await api.volumes.sync(options.volumes ?? [])

    await api.volumes.ensureTrashRoots(options.trashRoots ?? [])

    // Keep background indexing bounded. Scans are dominated by filesystem and
    // SQLite I/O, so matching worker count to CPU cores only creates contention
    // with interactive reads such as file previews.
    scanner = new FileScanner(config.get('appdata.cachePath'), databasePath)

    // A round trip confirms the worker loaded before exposing the server.
    await scanner.status()

    logger.info('Server started', {
      mountedVolumes: options.volumes?.length ?? 0,
    })

    let closing: Promise<void> | undefined

    return {
      api,
      config,
      logger,
      scanner,
      close(): Promise<void> {
        // Share shutdown too: stop worker writes before closing the main DB,
        // then flush the logger after the final server message.
        closing ??= (async () => {
          try {
            await scanner?.close()
          } finally {
            try {
              await database?.close()
              logger.info('Server stopped')
            } finally {
              await closeLogger()
              running = undefined
            }
          }
        })()

        return closing
      },
    }
  } catch (error) {
    logger.error('Server startup failed', error)

    try {
      await scanner?.close()
    } finally {
      await database?.close()
      await closeLogger()
    }

    throw error
  }
}
