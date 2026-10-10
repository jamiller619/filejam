import { type ComponentType, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './Layout.js'
import SuspenseOutlet from './SuspenseOutlet.js'

const Home = lazyRoute('/', () => import('~/pages/Home.jsx'))

export default function Router() {
  return (
    <Routes>
      <Route element={<SuspenseOutlet />}>
        <Route element={<Layout />}>
          <Route path={Home.path} element={<Home.Component />} />
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
