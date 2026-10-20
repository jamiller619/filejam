import { folderDragType } from '../utils/folderDrag.js'
import { useDropTarget } from './useDropTarget.js'

const acceptedFolderTypes = [folderDragType, 'Files']

export function useFavoriteFolderDrop() {
  async function addFavoriteFolders(dataTransfer: DataTransfer) {
    // Read native File objects before the drop's data store becomes unavailable.
    const internalPaths = dataTransfer.getData(folderDragType)
    const paths = internalPaths
      ? JSON.parse(internalPaths)
      : Array.from(dataTransfer.files, (file) =>
          window.files.getDroppedFilePath(file),
        )

    const updatedFavorites = await window.files.addFavoriteFolders(paths)

    window.dispatchEvent(
      new CustomEvent('files:config-updated', {
        detail: {
          key: 'user.favoriteFolders',
          value: updatedFavorites,
        },
      }),
    )
    window.dispatchEvent(new Event('files:libraries-updated'))
  }

  const { dropError, isDragging, dropTargetProps } = useDropTarget({
    acceptedTypes: acceptedFolderTypes,
    onDrop: addFavoriteFolders,
  })

  return {
    dropError: dropError
      ? 'Unable to add favorites. Drop accessible folders outside Trash.'
      : '',
    dropTargetProps: {
      'data-dragging': isDragging,
      ...dropTargetProps,
    },
  }
}
