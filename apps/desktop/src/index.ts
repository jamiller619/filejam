import { app } from 'electron'

function report(error: unknown) {
  console.error('Desktop startup failed', error)
  app.exit(1)
}

if (process.env.FILEJAM_BROWSER_POC === '1') {
  void import('./browser/bootstrap.js')
    .then((module) => module.startProof())
    .catch(report)
} else {
  void import('./normal.js').catch(report)
}
