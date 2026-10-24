import { css } from 'inline-css-modules'
import { useCallback, useMemo, useState } from 'react'
import { useApi } from '../../hooks/useApi.js'
import { useApiQuery } from '../../hooks/useApiQuery.js'
import { queryClient, queryKeys } from '../../queryClient.js'

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
    ul {
      margin: var(--suzy-space-2) 0 0;
      padding-inline-start: var(--suzy-space-5);
    }
    .empty {
      color: var(--suzy-text-muted);
    }
  }
`

export default function FileCollections({
  entryId,
  onChange,
}: {
  entryId: number
  onChange: () => void
}) {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const request = useCallback(
    () =>
      Promise.all([
        api.collections.list(),
        api.collections.forEntry(entryId),
        api.collections.getEntryState(entryId),
      ]),
    [api, entryId],
  )

  const queryKey = useMemo(() => queryKeys.entryCollections(entryId), [entryId])
  const { data, loadFailed, refresh } = useApiQuery<Awaited<
    ReturnType<typeof request>
  > | null>(queryKey, request, null)

  const collections = data?.[0] ?? []
  const matchedIds = new Set(data?.[1].map((item) => item.id) ?? [])
  const matchingCollections = collections.filter((collection) =>
    matchedIds.has(collection.id),
  )
  const favorite = data?.[2].favoritedAt !== null

  async function setFavorite(included: boolean) {
    setBusy(true)
    setError('')

    try {
      await api.collections.setFavorite(entryId, included)
      refresh()
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      onChange()
    } catch {
      setError('Unable to update favorite state.')
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
      <fieldset disabled={!data || busy}>
        <legend>File state</legend>
        <label>
          <input
            type="checkbox"
            checked={favorite}
            onChange={(event) => void setFavorite(event.target.checked)}
          />
          Favorite
        </label>
      </fieldset>
      <h5>Appears in</h5>
      {matchingCollections.length === 0 ? (
        <p className={styles.empty}>No collections currently match.</p>
      ) : (
        <ul>
          {matchingCollections.map((collection) => (
            <li key={collection.id}>{collection.name}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
