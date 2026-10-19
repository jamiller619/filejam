import type { DragEvent } from 'react'

export const folderDragType = 'application/x-files-folder-paths'

export function folderDragProps(path: string | undefined) {
  return {
    draggable: !!path,
    onDragStart(event: DragEvent) {
      if (!path) {
        event.preventDefault()
        return
      }
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData(folderDragType, JSON.stringify([path]))
    },
  }
}
