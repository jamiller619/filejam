import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useLocation } from 'react-router'

type SearchState = {
  search: string
  setSearch: (search: string) => void
}

export const SearchContext = createContext<SearchState | null>(null)

export function SearchProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [search, setSearch] = useState(
    () => new URLSearchParams(location.search).get('search') ?? '',
  )
  const value = useMemo(() => ({ search, setSearch }), [search])

  useEffect(() => {
    const canSearch =
      location.pathname === '/' || location.pathname.startsWith('/libraries/')
    const routeSearch = new URLSearchParams(location.search).get('search') ?? ''

    setSearch(canSearch ? routeSearch : '')
  }, [location.pathname, location.search])

  return createElement(SearchContext, { value }, children)
}

export function useSearch() {
  const context = useContext(SearchContext)

  if (!context) {
    throw new Error('Search must render inside the app layout')
  }

  return context
}
