import { type DragEvent, useState } from 'react'
import { folderDragType } from '../utils/folderDrag.js'
import { normalizePath } from '../utils/normalizePath.js'

export function useFolderDrop(destination: string | undefined) {
  const [isDragging, setIsDragging] = useState(false)
  const [dropFailed, setDropFailed] = useState(false)

  function acceptsDrop(dataTransfer: DataTransfer) {
    return !!destination && dataTransfer.types.includes(folderDragType)
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!acceptsDrop(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setIsDragging(true)
    setDropFailed(false)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    if (!destination || !acceptsDrop(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)

    try {
      const paths: unknown = JSON.parse(
        event.dataTransfer.getData(folderDragType),
      )

      if (
        !Array.isArray(paths) ||
        paths.some((path) => typeof path !== 'string')
      ) {
        throw new Error('Invalid folder drag data.')
      }

      const folderPaths = paths as string[]

      if (
        folderPaths.length === 1 &&
        normalizePath(folderPaths[0] ?? '') === normalizePath(destination)
      ) {
        setDropFailed(false)

        return
      }

      const favorites = await window.filejam.entries.moveFolders(
        folderPaths,
        destination,
      )

      window.dispatchEvent(
        new CustomEvent('filejam:settings-updated', {
          detail: { key: 'user.favoriteFolders', value: favorites },
        }),
      )
    } catch (error) {
      console.error('Unable to move folder', error)
      setDropFailed(true)
    }
  }

  return {
    'data-folder-drop-active': isDragging || undefined,
    'data-folder-drop-failed': dropFailed || undefined,
    'aria-invalid': dropFailed || undefined,
    onDragEnter: handleDragOver,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDragEnd() {
      setIsDragging(false)
    },
    onDrop(event: DragEvent<HTMLElement>) {
      void handleDrop(event)
    },
  }
}
