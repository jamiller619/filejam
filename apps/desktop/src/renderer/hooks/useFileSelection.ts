import { useEffect, useRef, useState } from 'react'

type FileSelectionOptions = {
  fileIds: readonly number[]
  detailsHost: HTMLElement | null
  onNavigate: (id: number) => void
}

/** Keeps the active file separate from the range selected with Shift+Arrow. */
export function useFileSelection({
  fileIds,
  detailsHost,
  onNavigate,
}: FileSelectionOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{
    activeId: number | null
    anchorId: number | null
    ids: ReadonlySet<number>
  }>({ activeId: null, anchorId: null, ids: new Set() })

  function selectFile(id: number | null) {
    setSelection({
      activeId: id,
      anchorId: id,
      ids: new Set(id === null ? [] : [id]),
    })
  }

  useEffect(() => {
    if (selection.activeId === null) {
      return
    }

    function clearSelection() {
      setSelection({ activeId: null, anchorId: null, ids: new Set() })
    }

    function isSelectionArea(target: EventTarget | null) {
      return (
        target instanceof Node &&
        (containerRef.current?.contains(target) ||
          detailsHost?.contains(target))
      )
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      // Details controls operate on the selected file, so keep it selected.
      if (target instanceof Node && detailsHost?.contains(target)) {
        return
      }

      if (
        target instanceof Element &&
        containerRef.current?.contains(target) &&
        target.closest('[data-file-id]')
      ) {
        return
      }

      clearSelection()
    }

    function handleFocusIn(event: FocusEvent) {
      if (!isSelectionArea(event.target)) {
        clearSelection()
      }
    }

    function handleFocusOut(event: FocusEvent) {
      if (
        isSelectionArea(event.target) &&
        !isSelectionArea(event.relatedTarget)
      ) {
        clearSelection()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    window.addEventListener('blur', clearSelection)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      window.removeEventListener('blur', clearSelection)
    }
  }, [detailsHost, selection.activeId])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target

      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
        !(target instanceof HTMLElement) ||
        (!containerRef.current?.contains(target) &&
          !detailsHost?.contains(target)) ||
        target.isContentEditable ||
        target.closest(
          'input, textarea, select, [role="slider"], [role="menu"], [role="listbox"], [role="combobox"], [role="tablist"]',
        ) ||
        selection.activeId === null
      ) {
        return
      }

      const currentIndex = fileIds.indexOf(selection.activeId)

      if (currentIndex === -1) {
        return
      }

      event.preventDefault()

      const nextId =
        fileIds[currentIndex + (event.key === 'ArrowRight' ? 1 : -1)]

      if (nextId === undefined) {
        return
      }

      const anchorId = event.shiftKey
        ? (selection.anchorId ?? selection.activeId)
        : nextId
      const anchorIndex = Math.max(0, fileIds.indexOf(anchorId))
      const nextIndex = fileIds.indexOf(nextId)
      const ids = event.shiftKey
        ? fileIds.slice(
            Math.min(anchorIndex, nextIndex),
            Math.max(anchorIndex, nextIndex) + 1,
          )
        : [nextId]

      setSelection({ activeId: nextId, anchorId, ids: new Set(ids) })
      onNavigate(nextId)

      // Keep keyboard focus and the visible card in sync when browsing the list.
      if (containerRef.current?.contains(target)) {
        const button = containerRef.current.querySelector<HTMLButtonElement>(
          `[data-file-id="${nextId}"] button`,
        )

        button?.focus({ preventScroll: true })
        button?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [fileIds, detailsHost, onNavigate, selection])

  return {
    containerRef,
    selectedId: selection.activeId,
    selectedIds: selection.ids,
    selectFile,
  }
}
