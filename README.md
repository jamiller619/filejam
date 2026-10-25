# Filejam

Private pnpm workspace using ESM and strict TypeScript.

- `packages/server`: Node.js server package (`@filejam/server`).
- `packages/ui`: browser UI package (`@filejam/ui`).
- `apps/desktop`: Electron desktop application (`@filejam/desktop`).

The desktop app boots the server in its main process and exposes scanner commands to a sandboxed renderer through a preload bridge.

## Development

Source code conventions are documented in [AGENTS.md](AGENTS.md), including
blank lines between logical steps and braces around control-flow bodies.

Use pnpm 12.10.1, as pinned in package.json.

```sh
pnpm install
pnpm typecheck
pnpm check
pnpm build
```

TypeScript and Biome are installed at the workspace root. Shared compiler settings live in `tsconfig.base.json`; the root `tsconfig.json` references all projects. Build output goes into each project's ignored `dist/` directory.

Run `pnpm check:fix` to apply safe lint fixes and formatting, `pnpm format` to format, or `pnpm clean` to remove compiler outputs.

Install the recommended VS Code extensions for Biome formatting and fixes on save and TypeScript 7 language support.

## Desktop app

Run `pnpm start` to build and open Electron. The window confirms that the server
and scanner worker are reachable. The server starts before the window loads and
closes its worker, database, and logger before Electron quits. Closing the last
window quits on Windows/Linux; on macOS, the server stays running until the app
quits, and activating the app reopens the window.

The main entry is `apps/desktop/src/index.ts`. The preload is compiled from
`src/scanner/preload.cts` to CommonJS so it works with Electron's renderer sandbox.
The initial renderer is a small local HTML page; it has no Node.js access.
Configuration follows the server's existing `FILEJAM_CONFIG_FILE` and app-data defaults.

Run `pnpm --filter @filejam/desktop test` on a graphical host to smoke-test the real
Electron window, scanner IPC, and server shutdown using temporary server data.
The launcher clears `ELECTRON_RUN_AS_NODE` for Electron so it opens as a desktop app.

## Database

The server exports a single `boot()` function. It loads configuration, initializes
logging, opens SQLite and applies migrations, then starts the scanner worker.
Concurrent calls share the same running instance. Importing the package does not
initialize services. Call `close()` during shutdown; a later `boot()` starts a
fresh instance.

```ts
import { boot } from '@filejam/server'

const server = await boot()
// Use server.db, server.scanner, server.logger, and server.config.
await server.close()
```

The database is `filejam.sqlite` inside the configured `appdata.dbPath` directory.
Logging and scanner cache use `appdata.logsPath` and `appdata.cachePath`.
Set `FILEJAM_CONFIG_FILE` to select a configuration file.

After changing schemas in `packages/server/src/db/schemas`, run
`pnpm --filter @filejam/server db:generate` and commit the generated migration files.
`pnpm build` copies migrations into the server build for runtime use.
Run `pnpm --filter @filejam/server test` to check initialization and persistence.

## File scanner

`FileScanner` from `@filejam/server/scanner` owns a bounded pool of Node worker threads (one by default). All crawling,
metadata checks, and cache reads/writes happen there. Supply an application-owned
cache directory (for example, under Electron's `app.getPath('userData')`). Use one
scanner pool per cache directory and close it during application shutdown.

```ts
const scanner = new FileScanner(cacheDirectory, databasePath)
await scanner.start('/absolute/path/to/folder')
const progress = await scanner.status()
// Poll until state is completed, failed, or cancelled.
const { added, changed, removed } = await scanner.results()
await scanner.close()
```

Results contain paths relative to the scanned root. The cache survives restarts
and tracks size/mtime changes. The server watches its libraries recursively and
queues scans after filesystem changes, coalescing bursts of events. Desktop
listings refresh as indexing progresses and completes. Symlink traversal is
disabled. A cache directory inside the scanned tree
is excluded. Failed or cancelled scans do not commit a new baseline. Cancellation
is cooperative: crawling and cache reconciliation may finish before it is handled.
Different library roots can scan concurrently; another start for an active or
queued root is rejected. Pass `{ maxConcurrentScans: 2 }` as the optional third
constructor argument when libraries are on separate drives and can benefit from
parallel I/O. `status()` includes per-library snapshots plus active and queued roots,
and remains scanning until all work finishes. Use `results(root)` for a particular
library; `results()` returns the most recently explicitly requested root (the last
root in `startAll`). Watcher events coalesce into at most one follow-up scan per
active root. `cancel()` clears the queue and cancels all active scans. Results reset on
start and become available after successful completion. The worker upserts a library for the canonical root and saves directory and file
rows to SQLite during each scan, including metadata and parent relationships.
Metadata is prepared before each write transaction; up to 64 entries commit
together in parent-first order. Completed batches remain visible if a later batch
fails or the scan is cancelled. Deletion reconciliation uses groups of up to 500
IDs in a single transaction after successful traversal.
Progress counts both directories and files. Cached files are still upserted so a
missing database row is repaired. Failed or cancelled scans retain saved rows;
stale rows are removed only after successful traversal. Database files and their
SQLite sidecars are excluded from scans.

Scan progress logs combine all libraries into one global heartbeat, with entry
and change counts, active/queued library counts, elapsed time, and overall entries
per second. Counts include completed scans and follow-up passes during the same
busy period and reset when a new run starts. Totals grow as libraries finish
crawling. A final summary is logged once the entire queue finishes.

The desktop main process registers `registerScannerIpc(scanner, window.webContents)`
from `src/scanner/main.ts` for each window. The preload exposes
`window.scanner.start(root)`, `.status()`, `.results()`, and `.cancel()`.
IPC is restricted to the registered window's main frame. Navigation and new windows
are blocked so the bridge remains available only to local app content. Handlers
are removed when the window closes or the app shuts down.

### File columns

`Files` accepts a folder reference (`{ libraryId, relativePath }`, with `''`
for the library root) and an optional `columns` array. Column names are typed from
the returned file record; the default is `['name', 'createdAt', 'modifiedAt',
'size']`. Size and modified time are refreshed from the filesystem on every scan.
