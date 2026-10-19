import { basename } from 'node:path'

const ignoredFileNames = new Set(['desktop.ini', 'ehthumbs.db', 'thumbs.db'])

/**
 * Keep operating-system metadata and hidden entries out of the file index.
 * Checking names instead of platform attributes gives scans the same result
 * when a Windows or macOS volume is scanned from another operating system.
 */
export function isIgnoredScanPath(path: string): boolean {
  const name = basename(path)

  return name.startsWith('.') || ignoredFileNames.has(name.toLowerCase())
}
