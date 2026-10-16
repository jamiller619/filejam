import { join } from 'node:path'
import type { ResolveDefaultFolder } from './api/defaultLibraries.js'
import { createApi } from './api/index.js'
import { initConfig } from './config/index.js'
import { initDatabase } from './db/index.js'
import { closeLogger, createLogger, initLogger } from './logger.js'
import { FileScanner } from './scanner/index.js'

// Keep the startup promise so callers also share initialization while it is in flight.
let running: ReturnType<typeof start> | undefined

export type { Library, ServerApi } from './api/index.js'
export type { Config, ConfigKey } from './config/config.js'

/** Initialize the server once; concurrent callers share the same instance. */
export function boot(
  options: { resolveDefaultFolder?: ResolveDefaultFolder } = {},
) {
  running ??= start(options).catch((error: unknown) => {
    // A failed boot must not prevent a later retry.
    running = undefined
    throw error
  })

  return running
}

async function start(options: { resolveDefaultFolder?: ResolveDefaultFolder }) {
  const config = await initConfig()

  await initLogger(config)

  const logger = createLogger('server')

  let database: Awaited<ReturnType<typeof initDatabase>> | undefined
  let scanner: FileScanner | undefined

  try {
    const databasePath = join(config.get('appdata.dbPath'), 'files.sqlite')

    database = await initDatabase(databasePath)
    const api = createApi(database.db, config)
    if (options.resolveDefaultFolder) {
      await api.libraries.initializeDefaults(
        options.resolveDefaultFolder,
        (message, error) => logger.warn(message, error),
      )
    }
    scanner = new FileScanner(config.get('appdata.cachePath'), databasePath)

    // A round trip confirms the worker loaded before exposing the server.
    await scanner.status()

    // Include previously seeded libraries: their setup marker may predate
    // automatic scanning. A batch acknowledges its start without delaying boot
    // until indexing finishes, and the worker processes roots sequentially.
    const libraries = await api.libraries.list()
    await scanner.startAll(libraries.map((library) => library.rootPath))

    logger.info('Server started', { queuedLibraries: libraries.length })

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
              database?.close()
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
      database?.close()
      await closeLogger()
    }

    throw error
  }
}
