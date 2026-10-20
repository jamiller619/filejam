import { type DragEvent, useRef, useState } from 'react'

type DropTargetOptions = {
  acceptedTypes: readonly string[]
  onDrop: (dataTransfer: DataTransfer) => Promise<void> | void
  dropEffect?: DataTransfer['dropEffect']
}

export function useDropTarget({
  acceptedTypes,
  onDrop,
  dropEffect = 'copy',
}: DropTargetOptions) {
  const [isDragging, setIsDragging] = useState(false)
  const [dropError, setDropError] = useState<unknown>()
  const isDropping = useRef(false)

  function acceptsDrop(dataTransfer: DataTransfer) {
    return dataTransfer.types.some((type) => acceptedTypes.includes(type))
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!acceptsDrop(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = isDropping.current ? 'none' : dropEffect
    setIsDragging(!isDropping.current)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)

    if (isDropping.current || !acceptsDrop(event.dataTransfer)) {
      return
    }

    isDropping.current = true
    setDropError(undefined)

    try {
      await onDrop(event.dataTransfer)
    } catch (error) {
      setDropError(error)
    } finally {
      isDropping.current = false
    }
  }

  return {
    dropError,
    isDragging,
    dropTargetProps: {
      onDragEnter: handleDragOver,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop(event: DragEvent<HTMLElement>) {
        void handleDrop(event)
      },
    },
  }
}
