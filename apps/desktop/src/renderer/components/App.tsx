import { Theme } from '@files/ui'
import { HashRouter } from 'react-router-dom'
import Router from './Router.js'

export default function App() {
  return (
    <Theme>
      <HashRouter>
        <Router />
      </HashRouter>
    </Theme>
  )
}
