import type { DragEvent } from 'react'

export const folderDragType = 'application/x-files-folder-paths'

function getFolderDragPreview(source: Element) {
  return (source.closest<HTMLElement>('[data-folder-drag-preview]') ??
    source) as HTMLElement
}

function setFolderDragImage(event: DragEvent) {
  const source = event.currentTarget
  const preview = getFolderDragPreview(source)
  const bounds = preview.getBoundingClientRect()
  const offsetX = Math.min(
    Math.max(event.clientX - bounds.left, 0),
    bounds.width,
  )
  const offsetY = Math.min(
    Math.max(event.clientY - bounds.top, 0),
    bounds.height,
  )

  const dragImage = preview.cloneNode(true) as HTMLElement

  dragImage.removeAttribute('data-folder-dragging')
  dragImage.setAttribute('aria-hidden', 'true')
  Object.assign(dragImage.style, {
    position: 'fixed',
    inset: 'auto auto auto -10000px',
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    margin: '0',
    opacity: '1',
    pointerEvents: 'none',
    transform: 'scale(1.02)',
    transformOrigin: 'center',
    filter: 'drop-shadow(0 8px 18px rgb(0 0 0 / 24%))',
  })
  document.body.append(dragImage)

  event.dataTransfer.setDragImage(dragImage, offsetX, offsetY)
  preview.dataset.folderDragging = 'true'

  window.setTimeout(() => dragImage.remove())
}

export function folderDragProps(path: string | undefined) {
  return {
    draggable: !!path,
    onDragStart(event: DragEvent) {
      if (!path) {
        event.preventDefault()

        return
      }

      event.dataTransfer.effectAllowed = 'copyMove'
      event.dataTransfer.setData(folderDragType, JSON.stringify([path]))
      setFolderDragImage(event)
    },
    onDragEnd(event: DragEvent) {
      getFolderDragPreview(event.currentTarget).removeAttribute(
        'data-folder-dragging',
      )
    },
  }
}
