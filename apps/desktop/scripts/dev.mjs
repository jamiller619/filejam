import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { relative, resolve, sep } from 'node:path'
import electron from 'electron'
import react from '@vitejs/plugin-react'
import { inlineCssModules } from 'inline-css-modules/vite'
import { createServer } from 'vite'
import { copyPreviewAssets } from './copy-preview-assets.mjs'

await copyPreviewAssets()

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('../src/renderer/', import.meta.url)),
  plugins: [
    inlineCssModules(),
    react(),
    {
      name: 'development-csp',
      transformIndexHtml(html) {
        return html.replace(
          "script-src 'self';",
          "script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*;",
        )
      },
    },
  ],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('../src/renderer/', import.meta.url)),
      '@files/ui': fileURLToPath(
        new URL('../../../packages/ui/src/index.ts', import.meta.url),
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      // Windows editors do not emit reliable file events into WSL mounts.
      usePolling:
        process.platform === 'linux' &&
        /^\/mnt\/[a-z]\//i.test(fileURLToPath(import.meta.url)),
      interval: 200,
      ignored: ['**/dist/**', '**/*.tsbuildinfo'],
    },
  },
})

await server.listen()
server.printUrls()

const env = { ...process.env, FILES_RENDERER_URL: server.resolvedUrls.local[0] }

delete env.ELECTRON_RUN_AS_NODE

const workspace = fileURLToPath(new URL('../../../', import.meta.url))
const desktop = fileURLToPath(new URL('../', import.meta.url))
let child
let rebuilding = false
let pending = false
let closing = false
let timer

function launch() {
  child = spawn(electron, [desktop, ...process.argv.slice(2)], {
    env,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  })

  child.once('error', (error) => {
    console.error('Unable to launch Electron', error)
    void shutdown(1)
  })

  child.once('exit', (code) => {
    if (!rebuilding && !closing) {
      void shutdown(code ?? 1)
    }
  })
}

async function stopElectron() {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const running = child

  await new Promise((resolve) => {
    const timeout = setTimeout(() => running.kill('SIGKILL'), 10000)

    running.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    if (running.connected) {
      running.send('files:dev:quit')
    } else {
      running.kill('SIGTERM')
    }
  })
}

function build() {
  return new Promise((resolve, reject) => {
    const process = spawn('pnpm', ['build'], { cwd: desktop, stdio: 'inherit' })

    process.once('error', reject)

    process.once('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Build failed (${code}); waiting for another edit`))
      }
    })
  })
}

async function restart() {
  if (rebuilding || closing) {
    return
  }

  rebuilding = true

  try {
    await stopElectron()

    while (pending && !closing) {
      pending = false
      console.log('Rebuilding desktop after workspace change…')
      await build()
    }

    if (!closing) {
      launch()
    }
  } catch (error) {
    console.error(error)
  } finally {
    rebuilding = false

    if (pending && !closing) {
      void restart()
    }
  }
}

async function shutdown(code = 0) {
  if (closing) {
    return
  }

  closing = true
  clearTimeout(timer)
  await stopElectron()
  await server.close()
  process.exitCode = code
}

server.watcher.add([
  resolve(workspace, 'apps'),
  resolve(workspace, 'packages'),
  resolve(workspace, 'package.json'),
  resolve(workspace, 'pnpm-lock.yaml'),
  resolve(workspace, 'pnpm-workspace.yaml'),
  resolve(workspace, 'tsconfig.base.json'),
  resolve(workspace, 'tsconfig.json'),
])

server.watcher.on('all', (event, file) => {
  if (!['add', 'change', 'unlink'].includes(event) || closing) {
    return
  }

  const path = relative(workspace, file).split(sep).join('/')

  if (
    path
      .split('/')
      .some((part) => ['node_modules', 'dist', '.git'].includes(part))
  ) {
    return
  }

  if (path.endsWith('.tsbuildinfo')) {
    return
  }

  const previewAsset =
    path === 'apps/desktop/src/renderer/assets/folder.svg' ||
    path.startsWith('packages/ui/src/assets/icons/')

  if (
    !previewAsset &&
    (path.startsWith('apps/desktop/src/renderer/') ||
      path.startsWith('packages/ui/src/'))
  ) {
    // Vite handles renderer and shared UI updates after invalidating its cache.
    return
  }

  pending = true
  clearTimeout(timer)
  timer = setTimeout(() => void restart(), 150)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void shutdown())
}

launch()
