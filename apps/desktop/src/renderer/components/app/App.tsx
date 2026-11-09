import { Theme, ToastProvider, ToastViewport } from '@filejam/ui'
import { AppearanceProvider } from '../icons/AppearanceProvider.js'
import QueryProvider from './QueryProvider.js'
import Router from './Router.js'

export default function App() {
  return (
    <Theme>
      <QueryProvider>
        <ToastProvider>
          <AppearanceProvider>
            <Router />
          </AppearanceProvider>
          <ToastViewport />
        </ToastProvider>
      </QueryProvider>
    </Theme>
  )
}
