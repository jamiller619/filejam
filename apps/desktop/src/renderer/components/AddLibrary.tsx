import { Button, Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { useState } from 'react'

const styles = css`
  .container {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .button {
    gap: var(--suzy-space-2);
    min-height: 32px;
    padding-inline: var(--suzy-space-3);
    border: 0;
    white-space: nowrap;
  }
  .error {
    margin-block: var(--suzy-space-2) 0;
    color: var(--suzy-red-11);
    font-size: var(--suzy-font-size-1);
  }
`

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
      const library = await window.files.libraries.add()

      if (library) {
        window.dispatchEvent(new Event('files:libraries-updated'))
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
