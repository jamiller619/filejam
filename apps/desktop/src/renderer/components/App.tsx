import { Theme, ToastProvider, ToastViewport } from '@files/ui'
import { HashRouter } from 'react-router-dom'
import Router from './Router.js'

export default function App() {
  return (
    <Theme>
      <ToastProvider>
        <HashRouter>
          <Router />
        </HashRouter>
        <ToastViewport />
      </ToastProvider>
    </Theme>
  )
}
