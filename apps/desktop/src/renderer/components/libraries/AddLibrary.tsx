import { Button, Icon } from '@filejam/ui'
import { useState } from 'react'
import styles from './AddLibrary.styles.js'

function useAddLibrary() {
  const [addingLibrary, setAddingLibrary] = useState(false)
  const [addLibraryFailed, setAddLibraryFailed] = useState(false)

  async function addLibrary() {
    if (addingLibrary) {
      return
    }

    setAddingLibrary(true)
    setAddLibraryFailed(false)

    try {
      const library = await window.filejam.libraries.add()

      if (library) {
        window.dispatchEvent(new Event('filejam:libraries-updated'))
      }
    } catch {
      setAddLibraryFailed(true)
    } finally {
      setAddingLibrary(false)
    }
  }

  return { addLibrary, addingLibrary, addLibraryFailed }
}

export default function AddLibrary() {
  const { addLibrary, addingLibrary, addLibraryFailed } = useAddLibrary()

  return (
    <div className={styles.container}>
      <Button
        className={styles.button}
        color="primary"
        aria-busy={addingLibrary}
        disabled={addingLibrary}
        onClick={() => void addLibrary()}
      >
        <Icon name="add" size={18} />
        <span>{addingLibrary ? 'Adding library...' : 'Add library'}</span>
      </Button>
      {addLibraryFailed && (
        <p className={styles.error} role="alert">
          Unable to add library.
        </p>
      )}
    </div>
  )
}
