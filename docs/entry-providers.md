# Entry providers

Entry providers let trusted desktop plugins describe special folder views and
resolve filesystem entries into richer application objects. The renderer never
loads provider code. Filejam validates provider metadata, runs resolution in the
main process, and mediates activation and native icon access.

## Package manifest

An entry provider uses the standard package fields and a `filejamApp` manifest:

```json
{
  "name": "@example/applications",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "filejamApp": {
    "type": "entry",
    "apiVersion": 1,
    "folders": [
      {
        "typeId": "example.applications",
        "platforms": ["win32"],
        "view": {
          "recursive": true,
          "showDirectories": false,
          "allowFlattenToggle": false
        }
      }
    ],
    "entries": [
      {
        "typeId": "@example/applications/shortcut",
        "platforms": ["win32"],
        "kinds": ["file"],
        "extensions": ["lnk"]
      }
    ]
  }
}
```

The default export implements `EntryProvider` from `@filejam/plugin-api`:

```ts
import type { EntryProvider } from '@filejam/plugin-api'

const provider: EntryProvider = {
  async resolve(request) {
    return {
      typeId: '@example/applications/shortcut',
      displayName: request.name.replace(/\.lnk$/i, ''),
      icon: { type: 'native', path: request.path },
      activation: { type: 'open-path', path: request.path },
    }
  },
}

export default provider
```

Installed package names are read from `entry-providers.json` in Electron's
`userData` directory:

```json
{
  "packages": ["@example/applications"]
}
```

Providers are trusted installed code with the user's OS permissions. Returning
an activation request does not expose arbitrary path launching to the renderer:
the renderer sends an indexed entry ID and the main process resolves that entry
through its registered provider before performing the action.

## Built-in Applications behavior

The built-in `@filejam/applications` provider assigns the default Applications
library the stable type `applications`. On Windows, the library root is always
recursive and hides intermediate Start Menu directories. `.lnk` files are
resolved with Electron's shortcut API so their target executable supplies the
native icon and target details. Double-clicking opens the original shortcut,
preserving its configured arguments and working directory.
