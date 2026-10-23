import { folderDragType } from '../utils/folderDrag.js'
import { useDragSource } from './useDragSource.js'

function canDragFolder(path: string | undefined) {
  return !!path
}

function serializeFolderPath(path: string | undefined) {
  return JSON.stringify([path])
}

export function useFolderDrag() {
  return useDragSource({
    type: folderDragType,
    canDrag: canDragFolder,
    serialize: serializeFolderPath,
    effectAllowed: 'copyMove',
  })
}
