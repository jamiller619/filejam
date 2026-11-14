import { join } from 'node:path'
import { createApi } from './api/index.js'
import type { VolumeInput } from './api/volumes.js'
import { initConfig } from './config/index.js'
import { initDatabase } from './db/index.js'
import { closeLogger, createLogger, initLogger } from './logger.js'
import { FileScanner } from './scanner/index.js'
import { watchRoots } from './scanner/watch.js'

// Keep the startup promise so callers also share initialization while it is in flight.
let running: ReturnType<typeof start> | undefined

type BootOptions = {
  volumes?: VolumeInput[]
  trashRoots?: string[]
  /** Native Windows helper used for full NTFS scans when available. */
  mftHelperPath?: string
  /** Network indexing is opt-in and always scheduled after local volumes. */
  indexNetworkVolumes?: boolean
  /** Retain individual changed paths for diagnostics; disabled in production. */
  collectScannerChangePaths?: boolean
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
  let stopWatching: (() => void) | undefined

  try {
    const databasePath = join(config.get('appdata.dbPath'), 'filejam.sqlite')

    database = await initDatabase(databasePath)

    const api = createApi(database.db)
    await api.volumes.sync(options.volumes ?? [])
    await api.volumes.ensureTrashRoots(options.trashRoots ?? [])

    const volumes = await api.volumes.list()
    const indexableVolumes = volumes
      .filter(
        (volume) =>
          options.indexNetworkVolumes === true || volume.kind !== 'network',
      )
      .sort((a, b) => volumePriority(a.kind) - volumePriority(b.kind))
    const roots = indexableVolumes.map((volume) => volume.rootPath)
    const excludedPaths = [
      ...volumes.map((volume) => volume.rootPath),
      config.get('appdata.path'),
      config.get('appdata.dbPath'),
      config.get('appdata.cachePath'),
      config.get('appdata.logsPath'),
    ]

    // Keep background indexing bounded. Scans are dominated by filesystem and
    // SQLite I/O, so matching worker count to CPU cores only creates contention
    // with interactive reads such as file previews.
    scanner = new FileScanner(config.get('appdata.cachePath'), databasePath, {
      excludedPaths,
      ...(options.mftHelperPath
        ? { mftHelperPath: options.mftHelperPath }
        : {}),
      collectChangePaths: options.collectScannerChangePaths === true,
    })

    // A round trip confirms the worker loaded before exposing the server.
    await scanner.status()

    // Include previously seeded libraries: their setup marker may predate
    // automatic scanning. A batch acknowledges its start without delaying boot
    // until indexing finishes, and the pool processes roots concurrently.
    const libraries = await api.libraries.list()

    stopWatching = watchLibraries(
      libraries.map((library) => library.rootPath),
      scanner,
      [
        config.get('appdata.dbPath'),
        config.get('appdata.cachePath'),
        config.get('appdata.logsPath'),
      ],
      (message, error) => logger.warn(message, error),
      database.db,
    )

    if (roots.length) {
      await scanner.startAll(roots)
    }

    logger.info('Server started', {
      mountedVolumes: options.volumes?.length ?? 0,
      indexedVolumes: roots.length,
      deferredNetworkVolumes: volumes.filter(
        (volume) =>
          volume.kind === 'network' && !roots.includes(volume.rootPath),
      ).length,
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
          stopWatching?.()
          stopWatching = undefined

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
    stopWatching?.()

    try {
      await scanner?.close()
    } finally {
      await database?.close()
      await closeLogger()
    }

    throw error
  }
}

function volumePriority(kind: VolumeInput['kind']) {
  switch (kind) {
    case 'system':
      return 0
    case 'internal':
      return 1
    case 'external':
      return 2
    case 'removable':
      return 3
    case 'virtual':
      return 4
    case 'network':
      return 5
  }
}
