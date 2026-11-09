import type { IconifyIcon } from '@iconify/react'
import icons from './library.json' with { type: 'json' }

// Only the curated, bundled subset is shipped to the renderer.
export const libraryIcons: Record<string, IconifyIcon> = icons
