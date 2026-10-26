import { createHashRouter, RouterProvider } from 'react-router'
import Browse from '../../pages/Browse.js'
import Collection from '../../pages/Collection.js'
import Home from '../../pages/Home.js'
import Settings from '../../pages/Settings.js'
import Layout from '../layout/Layout.js'

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/collections/:collectionId', element: <Collection /> },
      { path: '/', element: <Home /> },
      { path: '/settings', element: <Settings /> },
      { path: '/browse/:volumeId', element: <Browse /> },
    ],
  },
])

export default function Router() {
  return <RouterProvider router={router} />
}
