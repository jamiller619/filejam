import { isAbsolute, relative, sep } from 'node:path'

const maxPendingPaths = 256

/** Keep unrelated refreshes local without retaining an unbounded event backlog. */
export function addPendingPath(paths: Set<string>, root: string, path: string) {
  for (const pending of paths) {
    if (isInside(pending, path)) {
      return
    }
  }

  for (const pending of paths) {
    if (isInside(path, pending)) {
      paths.delete(pending)
    }
  }

  paths.add(path)

  // A broad refresh preserves correctness if sustained churn exceeds the bound.
  if (paths.size > maxPendingPaths) {
    paths.clear()
    paths.add(root)
  }
}

function isInside(parent: string, child: string) {
  const path = relative(parent, child)

  return (
    path === '' ||
    (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  )
}
