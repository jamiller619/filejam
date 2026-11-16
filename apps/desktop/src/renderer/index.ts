import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Renderer root element is missing')
}

const report = (error: unknown) => {
  console.error('Unable to load the Filejam renderer', error)
}

const render = async () => {
  if (window.browser?.mode === 'browser-poc') {
    const { default: Browser } = await import('./browser/Browser.js')
    createRoot(root).render(createElement(Browser))
    return
  }

  const { default: App } = await import('./components/app/App.js')
  createRoot(root).render(createElement(App))
}

void render().catch(report)
