import { Button, Input, Select, Theme } from '@filejam/ui'
import { useState } from 'react'
import type { ViewOptions } from '../../browser/protocol.js'
import EntryList from './EntryList.js'
import { useBrowser } from './useBrowser.js'

const initialOptions: ViewOptions = {
  nameContains: '',
  kind: 'all',
  sortDirection: 'asc',
}

export default function Browser() {
  const api = window.browser
  const [draftPath, setDraftPath] = useState('')
  const [draftOptions, setDraftOptions] = useState(initialOptions)
  const { state, navigate, select, timingNode } = useBrowser(
    api ?? unavailableApi,
  )
  const location = state.resolvedPath
  const options = state.appliedOptions

  const activateEntry = (index: number) => {
    const entry = state.entries[index]

    if (entry?.kind === 'directory') {
      navigate(entry.path, options)
    }
  }

  const goToDraftPath = () => {
    if (api && draftPath.trim()) {
      navigate(draftPath.trim(), options)
    }
  }

  const chooseFolder = async () => {
    if (!api) {
      return
    }

    const path = await api.chooseFolder()
    if (path) {
      setDraftPath(path)
      navigate(path, options)
    }
  }

  let status = 'Choose a folder'

  if (!api) {
    status = 'Browser service unavailable'
  } else if (state.phase === 'loading') {
    status = 'Loading'
  } else if (state.phase === 'receiving') {
    status = `Loading ${state.entries.length} of ${state.total ?? 0}`
  } else if (state.phase === 'error') {
    status = state.error ?? 'Unknown error'
  } else if (state.phase === 'complete') {
    status =
      state.entries.length === 0
        ? 'No matching entries'
        : `${state.total ?? state.entries.length} entries`
  }

  return (
    <Theme>
      <main
        data-testid="browser"
        data-generation={state.generation}
        data-phase={state.phase}
        data-received={state.entries.length}
        data-total={state.total ?? ''}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 12,
          padding: 16,
        }}
      >
        <output ref={timingNode} data-testid="timings" hidden />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            goToDraftPath()
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <Input
            data-testid="path-input"
            aria-label="Path"
            value={draftPath}
            onChange={(event) => setDraftPath(event.currentTarget.value)}
          />
          <Button data-testid="go" type="submit" disabled={!api}>
            Go
          </Button>
          <Button
            data-testid="choose-folder"
            type="button"
            onClick={chooseFolder}
            disabled={!api}
          >
            Choose a folder
          </Button>
          <Button
            data-testid="up"
            type="button"
            disabled={!api || !state.parentPath}
            onClick={() =>
              state.parentPath && navigate(state.parentPath, options)
            }
          >
            Up
          </Button>
          <Button
            data-testid="refresh"
            type="button"
            disabled={!api || !location}
            onClick={() => location && navigate(location, options)}
          >
            Refresh
          </Button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (api && location) {
              navigate(location, draftOptions)
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Input
            data-testid="name-filter"
            aria-label="Name contains"
            value={draftOptions.nameContains}
            onChange={(event) =>
              setDraftOptions({
                ...draftOptions,
                nameContains: event.currentTarget.value,
              })
            }
          />
          <Select
            label="Kind"
            value={draftOptions.kind}
            displayValue={draftOptions.kind}
            onValueChange={(value) =>
              value &&
              setDraftOptions({
                ...draftOptions,
                kind: value as ViewOptions['kind'],
              })
            }
          >
            <Select.MenuItem value="all">All</Select.MenuItem>
            <Select.MenuItem value="file">File</Select.MenuItem>
            <Select.MenuItem value="directory">Directory</Select.MenuItem>
          </Select>
          <span data-testid="kind-filter" />
          <Select
            label="Sort direction"
            value={draftOptions.sortDirection}
            displayValue={draftOptions.sortDirection}
            onValueChange={(value) =>
              value &&
              setDraftOptions({
                ...draftOptions,
                sortDirection: value as ViewOptions['sortDirection'],
              })
            }
          >
            <Select.MenuItem value="asc">Ascending</Select.MenuItem>
            <Select.MenuItem value="desc">Descending</Select.MenuItem>
          </Select>
          <span data-testid="sort-direction" />
          <Button
            data-testid="apply"
            type="submit"
            disabled={!api || !location}
          >
            Apply
          </Button>
        </form>
        <div data-testid="status" role="status">
          {status}
        </div>
        <EntryList
          key={state.generation}
          entries={state.entries}
          selectedIndex={state.selectedIndex}
          generation={state.generation}
          onSelect={select}
          onActivate={activateEntry}
        />
      </main>
    </Theme>
  )
}

const unavailableApi = {
  mode: 'browser-poc',
  chooseFolder: async () => null,
  start: async () => ({ id: '' }),
  next: async () => {},
  cancel: async () => {},
  onEvent: () => () => {},
} as const
