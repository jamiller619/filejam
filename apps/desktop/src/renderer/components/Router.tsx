import { type ComponentType, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './Layout.js'
import SuspenseOutlet from './SuspenseOutlet.js'

const Library = lazyRoute(
  '/libraries/:libraryId',
  () => import('~/pages/Library.js'),
)

const Collection = lazyRoute(
  '/collections/:collectionId',
  () => import('~/pages/Collection.js'),
)

const Home = lazyRoute('/', () => import('~/pages/Home.jsx'))

const Settings = lazyRoute('/settings', () => import('~/pages/Settings.js'))

export default function Router() {
  return (
    <Routes>
      <Route element={<SuspenseOutlet />}>
        <Route element={<Layout />}>
          <Route path={Collection.path} element={<Collection.Component />} />
          <Route
            path="/recents"
            element={<Navigate to="/collections/recents" replace />}
          />
          <Route
            path="/favorites"
            element={<Navigate to="/collections/favorites" replace />}
          />
          <Route path={Home.path} element={<Home.Component />} />
          <Route path={Settings.path} element={<Settings.Component />} />
          <Route path={Library.path} element={<Library.Component />} />
        </Route>
      </Route>
    </Routes>
  )
}

type PageModule = { default: ComponentType }

function lazyRoute(path: string, load: () => Promise<PageModule>) {
  let modulePromise: Promise<PageModule> | undefined
  const preload = () => (modulePromise ??= load())

  return {
    path,
    Component: lazy(preload),
    preload,
  }
}
