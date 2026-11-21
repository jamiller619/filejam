# Filesystem operations

The desktop main process owns one serialized `OperationService`. It accepts
absolute paths independently of libraries and indexed entry IDs. Files, folders,
links, and mixed selections use the same engine. Ancestors subsume selected
descendants; selection normalization sorts paths rather than comparing every pair.

The list, grid, and masonry views expose context-menu commands, Filejam-local
copy/cut/paste, F2 rename, Delete to trash, Ctrl/Cmd+Z undo, Ctrl+Y or
Ctrl/Cmd+Shift+Z redo. Shortcuts leave editable text controls alone. Folder drops
move the dragged selection; Ctrl-drop copies it. The clipboard is internal to
the running Filejam renderer, not an OS file clipboard integration.

Delete and Move to trash send the selection to the OS trash immediately. A
four-second toast offers Undo for that specific deletion when supported.

Bulk rename accepts `{name}`, `{ext}` (including its leading dot), and `{n}`
(one-based path order). Overlapping batch targets are rejected before mutation.
Rename opens a textbox over the displayed name in list, grid, and masonry views;
bulk rename edits its template in the same place. Enter saves, Escape cancels,
and leaving the textbox commits the edit. Single-file edits treat braces literally.
Known name collisions are checked before changing any selected item. A conflict
dialog offers an available numbered name such as `report (2).txt`, preserving file
extensions and keeping dotted folder names intact. Confirmation rechecks the name;
it never replaces an existing entry. Invalid names remain errors beside the editor.
Case-only renames are supported on Windows. Conflicts can stop, skip, keep both,
or explicitly replace. Replacement retains the displaced entry for undo; folders
are replaced as whole entries rather than merged.

## Safety and history

The journal uses Node's SQLite implementation, WAL, and FULL synchronous writes.
Selection records are inserted in a transaction; subsequent item checkpoints
update one row rather than rewriting the selection. Intent is committed before
filesystem changes. Renderer history responses include the latest 50 operations
and at most 100 items per operation, with explicit paging for further items.
Undo/redo availability is calculated from the complete journal. A separate Rust
worker performs native exclusive renames:
MoveFileExW without replacement on Windows, renameat2 with RENAME_NOREPLACE on
Linux, and renamex_np with RENAME_EXCL on macOS. A destination created by another
process cannot be silently overwritten by a final rename.

Copies stream one file at a time with backpressure and abortable pipelines.
Directories are traversed incrementally without following links. File contents,
basic mode bits, and access/modification timestamps are copied; preservation of
ACLs, extended attributes, sparse allocation, alternate data streams, and hard-link
relationships is not implemented. This is not a filesystem snapshot or a backup
tool. Permission and unsupported-link failures are reported with original files
retained.

Copies are staged in `.filejam-recovery` beside the destination. Source metadata
is checked around copying; files are flushed before publication. Cross-volume
moves publish the copy before deleting the source. Failed source cleanup retains
the complete destination and reports an uncertain result requiring inspection.
It never deletes the destination as a rollback for partial source deletion.

Undo moves copied output into recovery storage instead of deleting it. Redo can
therefore restore the exact copied bytes even if the original source is gone.
Copy undo refuses output whose metadata or descendants changed. Move/rename/trash
undo checks the root entry identity and carries descendant edits with the folder.
Undoing replacement also restores the displaced original. A newly committed
operation invalidates redo; retained recovery files are not automatically purged.

Trash uses the operating system's Recycle Bin or Trash through the
[trash crate](https://docs.rs/trash/5.2.9/trash/). It never creates Filejam-specific
trash folders. Windows and Linux record native trash references for restart-safe
undo and redo. Native bin identities are enumerated once before and once after a
selection, rather than once for every selected item. Ambiguous matches produce
an error and are never guessed. Emptying the OS trash removes the corresponding
restore capability; Filejam does not fall back to permanent deletion.

On macOS, native trash works, but programmatic restoration is unavailable in this
adapter. The toast directs users to Finder's Put Back command and history
explains why in-app undo is unavailable. Restores on Windows and Linux pass
through an operation recovery staging path before an exclusive move to the
original location, so a new destination cannot be overwritten during restoration.

Previously created `.filejam-trash` folders and journal records are preserved.
Legacy history can restore those items, but subsequent redo uses native trash.
No migration deletes or automatically re-trashes existing user data. The separate
`.filejam-recovery` mechanism remains for interrupted copies, replacement backups,
and undo/redo staging; it is not the trash destination.

Startup marks in-flight operations interrupted rather than replaying them.
“Check recovery” reconciles recorded output identities with current paths and
restores replacement backups where provable. Ambiguous cases retain their data
and require manual inspection. “Retry unfinished items” revalidates source
identities and refuses published/ambiguous outputs. Multi-item actions report
partial completion; undo reverses only completed items. Filesystem success is
separate from saved-path update failures; favorite path repairs are journaled and
can be retried without repeating filesystem mutations.

The previous folder-only handler, IPC/preload contracts, move-history API, and
startup replay were removed. Historical database migrations and the old tables
remain intact; the appearance asset collector still reads those archival records
to avoid collecting referenced uploads. Legacy records do not gain undo support.

## Verification

- `node --test apps/desktop/tests/file-operations.test.mjs`
- `cargo test --manifest-path packages/fs-service/Cargo.toml`
- `node apps/desktop/tests/run-file-operations-smoke.ts` after the desktop build
- `node apps/desktop/tests/file-operations-bench.mjs` after the desktop and Rust builds

The operation tests exercise mixed selections, bulk and case-only rename,
replacement backups, changed outputs, cancellation during a large file, links,
restart persistence, a failed journal commit, partial cross-volume source cleanup,
and retrying only unfinished items. The Electron smoke test exercises the real
preload bridge, selection, keyboard commands, dialogs, refresh, trash and restore.
Linux/macOS native branches and an actual second volume still need platform runs;
cross-volume cleanup failure is injected in the automated Windows tests.

On this Windows development machine, a 10,000-small-file folder copy took 49.97 s
while repeatedly listing the source through the Rust browser. A listing took
1.17 s before copying and 1.66 s at p95 over 32 concurrent samples. Renaming the
completed folder took 21 ms. A separate 1,000-file selection copied in 12.81 s.
Peak measured main-process event-loop delay was 25 ms and sampled RSS was 147 MB.
These measurements include durable writes and sandbox overhead; rerun the script
on representative local, removable, and network volumes before throughput tuning.
