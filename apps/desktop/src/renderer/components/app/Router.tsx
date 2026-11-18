import { createHashRouter, RouterProvider } from 'react-router'
import Layout from '../layout/Layout.js'

const router = createHashRouter([
  {
    element: <Layout />,
    hydrateFallbackElement: <p role="status">Loading Filejam…</p>,
    children: [
      {
        path: '/location',
        lazy: async () => {
          const { default: Component } = await import('../../pages/Location.js')
          return { Component }
        },
      },
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
    ],
  },
])

export default function Router() {
  return <RouterProvider router={router} />
}
