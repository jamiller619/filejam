import { createHashRouter, RouterProvider } from 'react-router'
import Collection from '../pages/Collection.js'
import Home from '../pages/Home.js'
import Library from '../pages/Library.js'
import Settings from '../pages/Settings.js'
import Layout from './Layout.js'

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/collections/:collectionId', element: <Collection /> },
      { path: '/', element: <Home /> },
      { path: '/settings', element: <Settings /> },
      { path: '/libraries/:libraryId', element: <Library /> },
    ],
  },
])

export default function Router() {
  return <RouterProvider router={router} />
}
