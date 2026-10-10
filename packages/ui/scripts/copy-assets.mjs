import { cp } from 'node:fs/promises'

await cp(
  new URL('../src/style/', import.meta.url),
  new URL('../dist/style/', import.meta.url),
  { recursive: true },
)
