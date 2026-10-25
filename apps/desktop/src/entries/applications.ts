import { basename, extname } from 'node:path'
import type {
  EntryManifest,
  EntryProvider,
  EntryResolution,
} from '@filejam/plugin-api'

export type ShortcutDetails = {
  target: string
  args?: string | undefined
  cwd?: string | undefined
}

export const applicationsManifest: EntryManifest = {
  id: '@filejam/applications',
  version: '1.0.0',
  apiVersion: 1,
  folders: [
    {
      typeId: 'applications',
      platforms: ['win32'],
      view: {
        recursive: true,
        showDirectories: false,
        allowFlattenToggle: false,
      },
    },
  ],
  entries: [
    {
      typeId: '@filejam/applications/windows-shortcut',
      platforms: ['win32'],
      kinds: ['file'],
      extensions: ['lnk'],
    },
  ],
}

export function createApplicationsProvider(
  readShortcut: (path: string) => ShortcutDetails,
): EntryProvider {
  return {
    async resolve(request): Promise<EntryResolution> {
      const displayName = basename(request.name, extname(request.name))
      const fallback: EntryResolution = {
        typeId: '@filejam/applications/windows-shortcut',
        displayName,
        activation: { type: 'open-path', path: request.path },
      }

      try {
        const shortcut = readShortcut(request.path)

        if (!shortcut.target) {
          return fallback
        }

        return {
          ...fallback,
          icon: { type: 'native', path: shortcut.target },
          details: {
            Target: shortcut.target,
            ...(shortcut.args ? { Arguments: shortcut.args } : {}),
            ...(shortcut.cwd ? { 'Working directory': shortcut.cwd } : {}),
          },
        }
      } catch {
        return fallback
      }
    },
  }
}
