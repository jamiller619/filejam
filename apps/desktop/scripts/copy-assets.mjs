import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { inlineCssModules } from 'inline-css-modules/vite'

await import('../../../packages/ui/scripts/copy-assets.mjs')

await build({
  configFile: false,
  plugins: [inlineCssModules()],
  root: fileURLToPath(new URL('../src/renderer/', import.meta.url)),
  base: './',
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('../src/renderer/', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/renderer/', import.meta.url)),
    emptyOutDir: false,
  },
})
