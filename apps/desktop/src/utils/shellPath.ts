/** Windows shell associations expect ordinary paths rather than device paths. */
export function shellPath(path: string, platform = process.platform): string {
  if (platform !== 'win32') {
    return path
  }

  if (/^\\\\\?\\UNC\\/i.test(path)) {
    return `\\\\${path.slice(8)}`
  }

  if (/^\\\\\?\\[A-Za-z]:\\/.test(path)) {
    return path.slice(4)
  }

  return path
}
