import { type DragEvent, useCallback } from 'react'

type DragSourceOptions<Value> = {
  type: string
  serialize: (value: Value) => string
  canDrag?: (value: Value) => boolean
  effectAllowed?: DataTransfer['effectAllowed']
}

function alwaysAllowDrag() {
  return true
}

export function useDragSource<Value>({
  type,
  serialize,
  canDrag = alwaysAllowDrag,
  effectAllowed = 'copy',
}: DragSourceOptions<Value>) {
  return useCallback(
    (value: Value) => {
      const draggable = canDrag(value)

      return {
        draggable,
        onDragStart(event: DragEvent<HTMLElement>) {
          if (!draggable) {
            event.preventDefault()

            return
          }

          event.dataTransfer.effectAllowed = effectAllowed
          event.dataTransfer.setData(type, serialize(value))
        },
      }
    },
    [canDrag, effectAllowed, serialize, type],
  )
}
