import { useCallback, useEffect, useRef, useState } from 'react'

type FileSelectionOptions = {
  fileIds: readonly number[]
  itemIds: readonly number[]
  detailsHost: HTMLElement | null
  onNavigate: (id: number) => void
}

type SelectionModifiers = {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/** Shares the selection anchor between pointer ranges and keyboard navigation. */
export function useFileSelection({
  fileIds,
  itemIds,
  detailsHost,
  onNavigate,
}: FileSelectionOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{
    activeId: number | null
    anchorId: number | null
    ids: ReadonlySet<number>
  }>({ activeId: null, anchorId: null, ids: new Set() })

  const selectFile = useCallback(
    (id: number | null, modifiers: SelectionModifiers = {}) => {
      setSelection((current) => {
        if (id === null) {
          return { activeId: null, anchorId: null, ids: new Set() }
        }

        const additive = modifiers.ctrlKey || modifiers.metaKey

        if (modifiers.shiftKey) {
          const anchorId = current.anchorId ?? id
          const anchorIndex = itemIds.indexOf(anchorId)
          const endIndex = itemIds.indexOf(id)
          const range =
            anchorIndex < 0 || endIndex < 0
              ? [id]
              : itemIds.slice(
                  Math.min(anchorIndex, endIndex),
                  Math.max(anchorIndex, endIndex) + 1,
                )

          return {
            activeId: id,
            anchorId: anchorIndex < 0 ? id : anchorId,
            ids: new Set(additive ? [...current.ids, ...range] : range),
          }
        }

        const ids = additive ? new Set(current.ids) : new Set<number>()

        if (additive && ids.has(id)) {
          ids.delete(id)
        } else {
          ids.add(id)
        }

        return {
          activeId: ids.has(id) ? id : (ids.values().next().value ?? null),
          anchorId: id,
          ids,
        }
      })
    },
    [itemIds],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target

      if (
        event.defaultPrevented ||
        event.altKey ||
        event.isComposing ||
        !(target instanceof HTMLElement) ||
        (!containerRef.current?.contains(target) &&
          !detailsHost?.contains(target)) ||
        target.isContentEditable ||
        target.closest(
          'input, textarea, select, [role="slider"], [role="menu"], [role="listbox"], [role="combobox"], [role="tablist"]',
        )
      ) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelection({
          activeId: selection.activeId ?? itemIds[0] ?? null,
          anchorId: selection.anchorId ?? itemIds[0] ?? null,
          ids: new Set(itemIds),
        })

        return
      }

      if (
        event.ctrlKey ||
        event.metaKey ||
        selection.activeId === null ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return
      }

      const currentIndex = itemIds.indexOf(selection.activeId)

      if (currentIndex === -1) {
        return
      }

      event.preventDefault()

      const nextId =
        itemIds[currentIndex + (event.key === 'ArrowRight' ? 1 : -1)]

      if (nextId === undefined) {
        return
      }

      selectFile(nextId, event)

      if (fileIds.includes(nextId)) {
        onNavigate(nextId)
      }

      // Keep keyboard focus and the visible card in sync when browsing the list.
      if (containerRef.current?.contains(target)) {
        const button = containerRef.current.querySelector<HTMLElement>(
          `[data-file-id="${nextId}"] button, [data-file-id="${nextId}"] a`,
        )

        button?.focus({ preventScroll: true })
        button?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fileIds, itemIds, detailsHost, onNavigate, selection, selectFile])

  return {
    containerRef,
    selectedId: selection.activeId,
    selectedIds: selection.ids,
    selectFile,
  }
}
