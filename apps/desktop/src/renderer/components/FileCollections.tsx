import { css } from 'inline-css-modules'
import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import { useApiQuery } from '../hooks/useApiQuery.js'
import { notifyCollectionsChanged } from '../hooks/useCollections.js'

const styles = css`
  .collections {
    fieldset {
      margin: 0;
      padding: var(--suzy-space-2);
      border: 1px solid var(--suzy-gray-7);
      border-radius: var(--suzy-radius-2);
    }
    label {
      display: flex;
      align-items: center;
      gap: var(--suzy-space-2);
    }
    form {
      display: flex;
      gap: var(--suzy-space-2);
      margin-block-start: var(--suzy-space-2);
      input {
        min-width: 0;
        flex: 1;
      }
    }
  }
`

type Collection = Awaited<
  ReturnType<Window['files']['collections']['list']>
>[number]

export default function FileCollections({
  entryId,
  onChange,
}: {
  entryId: number
  onChange: () => void
}) {
  const api = useApi()
  const [collections, setCollections] = useState<Collection[]>([])
  const [memberships, setMemberships] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const request = useCallback(
    () =>
      Promise.all([api.collections.list(), api.collections.forEntry(entryId)]),
    [api, entryId],
  )
  const { data, loadFailed } = useApiQuery<Awaited<
    ReturnType<typeof request>
  > | null>(request, null)
  useEffect(() => {
    if (!data) return
    const [items, included] = data
    setCollections(items.filter((item) => item.id !== 'recents'))
    setMemberships(included.map((item) => item.id))
    setReady(true)
  }, [data])
  const toggle = async (id: string, included: boolean) => {
    setBusy(true)
    setError('')
    try {
      await api.collections.setMembership(id, entryId, included)
      setMemberships((current) =>
        included ? [...current, id] : current.filter((value) => value !== id),
      )
      onChange()
    } catch {
      setError('Unable to update collection.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className={styles.collections} aria-label="Collections">
      <h5>Collections</h5>
      {(error || loadFailed) && (
        <p role="alert">{error || 'Unable to load collections.'}</p>
      )}
      <fieldset disabled={!ready || busy}>
        <legend>Add to collections</legend>
        {collections.map((collection) => (
          <label key={collection.id}>
            <input
              type="checkbox"
              checked={memberships.includes(collection.id)}
              onChange={(event) =>
                void toggle(collection.id, event.target.checked)
              }
            />
            {collection.name}
          </label>
        ))}
      </fieldset>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (!name.trim() || busy) return
          setBusy(true)
          setError('')
          try {
            const collection = await api.collections.create(name)
            setCollections((current) => [...current, collection])
            setName('')
            notifyCollectionsChanged()
            await toggle(collection.id, true)
          } catch {
            setError('Unable to create collection.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          aria-label="New collection name"
          placeholder="New collection"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!ready || busy}
        />
        <button type="submit" disabled={!ready || busy || !name.trim()}>
          Create
        </button>
      </form>
    </section>
  )
}
