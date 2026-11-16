# Live filesystem browser proof

The proof runs inside the existing Electron application with a separate Rust child
process. It enumerates the requested directory live, finishes filtering and sorting
before publishing the listing, and delivers ordered, bounded batches to a virtualized
React view. It does not implement persistence or the future indexer.

## Commands

- `pnpm poc:live` builds and launches the isolated proof window.
- `pnpm poc:test` runs Rust formatting/tests/release build, the desktop build,
  discovered proof tests, supplied contract tests, and real Electron interaction
  and active-window shutdown smoke tests. Logs are in `.poc-output/proof-check-*.log`.
- `pnpm poc:bench --sizes 0,1000` runs the development benchmark.
- `pnpm poc:bench` runs 0/1,000/10,000/100,000-entry fixtures, three view cases,
  and one first measured run plus ten warm repetitions per case.
- `node apps/desktop/tests/run-smoke.mjs` checks normal application startup separately.

Windows Electron checks may require approved execution outside the coding agent's
sandbox. Electron's own sandbox stays enabled; no ACL changes are needed.

## Architecture and verification

| Gate | Evidence |
| --- | --- |
| Runtime independent of the legacy server/indexer/database | `src/index.ts` selects the isolated bootstrap; the real smoke rejects legacy IPC registrations and app database artifacts |
| Complete enumeration before visible rows | Rust `filesystem.rs` prepares the whole immediate directory and applies the view before returning; controller publishes only prepared listings |
| Correct filters/order | Fixed service and renderer fixtures, seven exact DOM name vectors, directories first, descending order, and empty results |
| Bounded work and transport | One enumeration worker, one pending mailbox slot, 32-event channel, 32-command client queue, 1 MiB line cap, 512 KiB/256-entry batches, 250,000-entry directory limit |
| Virtualized DOM | Real 10,000-entry smoke asserts fewer than 200 rendered rows, final-entry visibility and offscreen keyboard selection |
| Race/error handling | Generation and request-ID checks, deferred race tests, real A-to-B navigation, service termination while a pull is pending, visible service-unavailable error |
| Navigation and Refresh | Double click, Enter, Up, invalid-path recovery, external create/delete plus Refresh, applied view retention and canceled picker |
| Ownership and shutdown | Sender/subframe authorization, fixed sandbox preload bridge, real window close during active work and confirmed service exit |
| Normal application | Existing normal-app smoke verifies routes, renderer reload, scanner bridge, and server shutdown |
| Timing and memory | Main/service/renderer clocks remain separate; one current measurement per process; first committed rows and frame opportunity are distinct; 250 ms sampled memory peaks with explicit unavailable reasons |

The direct completion also removed unbounded retired-request-ID bookkeeping from
the proof IPC layer. Only the current active request needs authorization state.

## Limits

This is a Windows local-filesystem proof, not a production Explorer replacement.
There is no file mutation, watcher, saved-view persistence, Turso database, indexing
service, macOS validation, network-share validation, or production installer here.
The benchmark measures empty synthetic files/directories with name filtering and
sorting. Fixture creation is excluded. First measured runs follow setup navigation
and must not be described as cold-cache runs. A frame opportunity is not measured
pixel presentation. Sampled memory peaks can miss transient allocations.
The accepted benchmark disables background throttling in its harness window so
changing focus cannot turn delivery timers into background timers. The production
window keeps its normal settings. An earlier throttled full run timed out and is
retained as an unsuccessful exploratory artifact, not included in the final results.

Full-directory preparation and the renderer's immutable batch accumulation remain
potential large-directory costs. No speed threshold was approved; a correct measured
baseline is not evidence that responsiveness is good enough for the final product.

The repository's ten original Biome diagnostics are retained and compared against
the frozen baseline. `pnpm check` therefore still exits 1; this is not a clean-lint claim.
Benchmark JSON and run logs are ignored local artifacts. The task kit itself is also
currently ignored by the repository's existing `.gitignore` configuration.

Final measured results and task receipts are recorded under `docs/browser-poc/results/`.

## Final measured baseline

Source: [raw benchmark JSON](../.poc-output/benchmark-1794777231505.json). All 132 samples passed count/boundary checks; no exclusions in this final run. Earlier interrupted exploratory runs are not included.

| Entries | View | First complete ms | Warm first rows median ms | Warm first rows p95 ms | Warm complete median ms | Warm complete p95 ms | Peak MiB main / renderer / service |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | asc/all | 11.3 | n/a | n/a | 5.7 | 9.4 | 99.8 / 90.3 / n/a |
| 0 | desc/all | 3.7 | n/a | n/a | 4.9 | 5.9 | 100.4 / 94.8 / n/a |
| 0 | asc/000 | 5.0 | n/a | n/a | 3.9 | 5.2 | 101.9 / 100.4 / n/a |
| 1000 | asc/all | 67.2 | 53.8 | 66.3 | 67.7 | 81.5 | 107.6 / 122.8 / n/a |
| 1000 | desc/all | 74.7 | 49.6 | 56.9 | 62.3 | 72.8 | 106.9 / 149.9 / n/a |
| 1000 | asc/000 | 63.8 | 59.6 | 85.0 | 77.2 | 101.3 | 107.4 / 164.3 / n/a |
| 10000 | asc/all | 516.2 | 404.8 | 413.0 | 508.8 | 515.4 | 114.5 / 188.3 / 6.1 |
| 10000 | desc/all | 514.1 | 401.7 | 412.6 | 503.6 | 512.2 | 115.3 / 216.5 / 6.1 |
| 10000 | asc/000 | 421.2 | 409.9 | 418.4 | 419.9 | 427.3 | 115.6 / 212.9 / 6.2 |
| 100000 | asc/all | 8281.3 | 6466.8 | 6640.7 | 7927.4 | 8156.9 | 122.6 / 296.5 / 26.3 |
| 100000 | desc/all | 7989.1 | 6490.3 | 6585.6 | 7980.4 | 8145.6 | 141.6 / 301.9 / 28.0 |
| 100000 | asc/000 | 6431.6 | 6488.7 | 6553.8 | 6505.5 | 6567.6 | 135.8 / 285.8 / 22.3 |

Machine: AMD Ryzen 5 3600 6-Core Processor              ; 12 logical CPUs; 31.9 GiB RAM; win32 10.0.26300; rustc 1.100.0 (0ef1bc386 2026-11-09); release service. Storage model/cache state not measured. The checkout is dirty; revision and exact status are recorded in the JSON.

Final validation: 37 Rust tests and 69 Node tests passed; both real proof smokes and the ordinary desktop smoke passed. Typecheck and format passed. Lint retains the 10 original baseline diagnostics.
