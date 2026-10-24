import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import App from './components/app/App.js'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Renderer root element is missing')
}

createRoot(root).render(createElement(App))
