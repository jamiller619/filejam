export function normalizePath(path: string) {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')

  return /^[a-z]:|^\\\\/i.test(path) ? normalized.toLowerCase() : normalized
}
