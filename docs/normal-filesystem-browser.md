# Normal filesystem browser

`pnpm start` and `pnpm dev` open the original Filejam interface: titlebar,
resizable navbar, Home favorites, file toolbars, list/grid/masonry views, details,
previews, split panes, settings and collections. Locations replaces Libraries;
Open folder and breadcrumbs navigate arbitrary absolute paths.

The normal main process starts the existing metadata service in browsing-only
mode. It does not seed library records, create scanner workers, or watch/index
folders. The Rust filesystem service supplies folder enumeration. The adapter
uses at most two service processes (one per visible pane), pulls bounded batches,
and resolves metadata/provider information with 16 concurrent operations per
pane. Recursive flattening walks one directory at a time, never follows symlinks,
and limits traversal to 250,000 entries. Complete filtered listings reach the
existing table model, which applies saved sorting/grouping before rendering.
Folder listings are never inserted into SQLite.

Favorites use the existing settings store, independently of libraries. View
preferences remain in the existing per-view storage. Collections retain their
existing metadata UI, but assigning unindexed filesystem entries to collections,
path-based custom icons, and filesystem folder moves need their persistence and
operation contracts migrated separately. Those indexed-entry controls are not
exposed for transient filesystem rows.

The authorized cleanup removed 13 library records and dependent indexed entries.
No filesystem files were removed. The one-off cleanup script remains at
`apps/desktop/scripts/remove-library-records.mjs`.

`pnpm poc:live` remains the standalone proof harness. Normal UI smoke runs through
`node apps/desktop/tests/run-smoke.mjs`, with isolated settings/database and real
Rust listings. It exercises all three existing views, previews, details, split
panes, navigation, favorite persistence, and a 10,000-entry metadata listing.

Visibility is configured through the existing desktop Settings page:
`user.files.showHidden` and `user.files.showSystem`, both off by default.
Rust reports native hidden/system attributes plus narrowly scoped system names;
filtering happens before metadata enrichment and recursive descent. Protected
items use their own switch even when also hidden. Explicit navigation still
opens hidden/protected directories when filesystem permissions allow it.
