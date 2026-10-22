import { Theme, ToastProvider, ToastViewport } from '@files/ui'
import { HashRouter } from 'react-router'
import QueryProvider from './QueryProvider.js'
import Router from './Router.js'

export default function App() {
  return (
    <Theme>
      <QueryProvider>
        <ToastProvider>
          <HashRouter>
            <Router />
          </HashRouter>
          <ToastViewport />
        </ToastProvider>
      </QueryProvider>
    </Theme>
  )
}
