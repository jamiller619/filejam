import { HashRouter } from 'react-router-dom'
import Router from './Router.js'
import { Theme } from '@files/ui';

export default function App() {
  return (
    <Theme>
      <HashRouter>
        <Router />
      </HashRouter>
    </Theme>
  )
}
