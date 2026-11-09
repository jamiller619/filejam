# Custom item icons

`AppearanceProvider` loads one shared map of customized entries and collections.
Favorites use the underlying folder target. Use `IconButton`, `IconMenu`, or
`useAppearance().edit()` to open the shared picker.

The catalog is defined in `packages/server/src/icons.ts`. `generate-icons.mjs`
extracts the selected Lucide icons into `library.json`; the asset build runs this
script automatically. Keep existing identifiers when updating the catalog.
The renderer passes bundled icon data to Iconify and never requests its API.
The source license is copied into `dist/licenses` during the desktop build.

Uploads are normalized in the main process, stored under `userData/icons`, and
served by `filejam-icon://asset/<sha256>`. The original image can be removed.
Unreferenced registered assets older than one day are collected at startup.

Entry appearance survives scanner updates. App-initiated folder moves snapshot
customizations in move history and restore them through `pending_appearance`,
including descendants and moves across libraries. External filesystem moves
are not identity-reconciled; a deleted/recreated entry receives its default icon.

Run `pnpm --filter @filejam/desktop test:icons` for the hidden Electron workflow
test. Persistence and upload validation tests run with the existing package
test suites.
