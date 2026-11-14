export function findVerticalScrollElement(element: HTMLElement | null) {
  let candidate = element?.parentElement ?? null

  while (candidate) {
    const { overflowY } = window.getComputedStyle(candidate)

    if (overflowY === 'auto' || overflowY === 'scroll') {
      return candidate
    }

    candidate = candidate.parentElement
  }

  return null
}
