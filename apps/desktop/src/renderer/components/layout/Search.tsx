import { Input } from '@filejam/ui'
import { css } from 'inline-css-modules'
import { useEffect } from 'react'
import { useLocation, useMatch } from 'react-router'
import { useSearch } from './SearchContext.js'

const style = css`
  .search {
    justify-self: center;
    width: 100%;

    > span {
      width: 100%;
    }

    input {
      width: 100%;
      corner-shape: round;
      border-radius: 100px;
    }
  }
`

export default function Search() {
  const libraryMatch = useMatch('/location')
  const homeMatch = useMatch('/')
  const location = useLocation()
  const { search, setSearch } = useSearch()
  const canSearch = libraryMatch !== null || homeMatch !== null

  useEffect(() => {
    const currentSearch =
      new URLSearchParams(location.search).get('search') ?? ''

    if (search === currentSearch) {
      return
    }

    const timeout = window.setTimeout(() => {
      const searchParams = new URLSearchParams(location.search)

      if (search) {
        searchParams.set('search', search)
      } else {
        searchParams.delete('search')
      }

      const query = searchParams.size ? `?${searchParams}` : ''
      const route = `${location.pathname}${query}${location.hash}`
      const url = new URL(window.location.href)

      url.hash = route
      window.history.replaceState(window.history.state, '', url)
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [location.hash, location.pathname, location.search, search])

  return (
    <div className={style.search}>
      <Input
        aria-label="Search open folders"
        disabled={!canSearch}
        icon="search"
        type="search"
        value={canSearch ? search : ''}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
    </div>
  )
}
