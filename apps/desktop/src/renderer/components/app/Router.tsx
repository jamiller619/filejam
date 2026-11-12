import { createHashRouter, RouterProvider } from 'react-router'
import Layout from '../layout/Layout.js'

const router = createHashRouter([
  {
    element: <Layout />,
    hydrateFallbackElement: <p role="status">Loading Filejam…</p>,
    children: [
      {
        path: '/collections/:collectionId',
        lazy: async () => {
          const { default: Component } = await import(
            '../../pages/Collection.js'
          )

          return { Component }
        },
      },
      {
        path: '/',
        lazy: async () => {
          const { default: Component } = await import('../../pages/Home.js')

          return { Component }
        },
      },
      {
        path: '/settings',
        lazy: async () => {
          const { default: Component } = await import('../../pages/Settings.js')

          return { Component }
        },
      },
      {
        path: '/libraries/:libraryId',
        lazy: async () => {
          const { default: Component } = await import('../../pages/Library.js')

          return { Component }
        },
      },
    ],
  },
])

export default function Router() {
  return <RouterProvider router={router} />
}
