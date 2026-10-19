import { Button, Icon } from '@files/ui'
import { css } from 'inline-css-modules'
import { useState } from 'react'

const styles = css`
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--suzy-space-3);
    padding-block: var(--suzy-space-2);
    padding-inline-end: calc(var(--scrollbar-size, 10px) + var(--suzy-space-2));
  }
  .addButton {
    gap: var(--suzy-space-2);
    min-height: 32px;
    padding-inline: var(--suzy-space-3);
    border: 0;
  }
`

export default function LibrariesToolbar() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function addLibrary() {
    if (busy) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const library = await window.files.libraries.add()

      if (library) {
        window.dispatchEvent(new Event('files:libraries-updated'))
      }
    } catch {
      setError('Unable to add library.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Library actions"
      >
        <Button
          className={styles.addButton}
          color="primary"
          disabled={busy}
          onClick={() => void addLibrary()}
        >
          <Icon name="add" size={18} />
          <span>{busy ? 'Adding…' : 'Add library'}</span>
        </Button>
      </div>
    </>
  )
}
