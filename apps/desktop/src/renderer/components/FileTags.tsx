import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'

type FileEntry = Awaited<ReturnType<Window['files']['entries']['setAppTags']>>

export default function FileTags({
  entry,
  onChange,
}: {
  entry: FileEntry
  onChange: (entry: FileEntry) => void
}) {
  const api = useApi()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  if (!editing) {
    return (
      <div>
        <span>{entry.tags.join(', ') || '—'}</span>{' '}
        <button
          type="button"
          aria-label={`Edit app tags for ${entry.name}`}
          onClick={() => {
            setDraft(entry.appTags.join('\n'))
            setError(false)
            setEditing(true)
          }}
        >
          Edit
        </button>
        {entry.tagReadError && (
          <span role="status" title={entry.tagReadError}>
            {' '}
            Some tags could not be read.
          </span>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError(false)

        try {
          const updated = await api.entries.setAppTags(
            entry.id,
            draft.split('\n').filter((tag) => tag.trim()),
          )

          onChange(updated)
          setEditing(false)
        } catch {
          setError(true)
        } finally {
          setSaving(false)
        }
      }}
    >
      <label>
        App tags (one per line)
        <textarea
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {entry.osTags.length > 0 && <p>OS tags: {entry.osTags.join(', ')}</p>}
      {entry.embeddedTags.length > 0 && (
        <p>Embedded tags: {entry.embeddedTags.join(', ')}</p>
      )}
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" disabled={saving} onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && (
        <p role="alert">
          Unable to save tags. Use up to 100 tags, each no longer than 256
          characters.
        </p>
      )}
    </form>
  )
}
