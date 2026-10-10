import SuspenseOutlet from './SuspenseOutlet.js'
import Toolbar from './Toolbar.js'

export default function Layout() {
  return (
    <div>
      <Toolbar />
      <SuspenseOutlet />
    </div>
  )
}
