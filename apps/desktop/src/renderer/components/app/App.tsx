import { Theme, ToastProvider, ToastViewport } from '@files/ui'
import QueryProvider from './QueryProvider.js'
import Router from './Router.js'

export default function App() {
  return (
    <Theme>
      <QueryProvider>
        <ToastProvider>
          <Router />
          <ToastViewport />
        </ToastProvider>
      </QueryProvider>
    </Theme>
  )
}
