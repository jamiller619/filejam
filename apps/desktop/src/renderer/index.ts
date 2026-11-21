import { ContextMenuInspector } from '@filejam/ui'
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
  const { default: Component } = window.filejam
    ? await import('./components/app/App.js')
    : await import('./browser/Browser.js')
  const canInspect = await window.filejam?.canInspect()
  const inspect = canInspect
    ? (x: number, y: number) => {
        void window.filejam.inspectElement(x, y).catch(console.error)
      }
    : undefined

  createRoot(root).render(
    createElement(
      ContextMenuInspector.Provider,
      { value: inspect },
      createElement(Component),
    ),
  )
}

void render().catch(report)
