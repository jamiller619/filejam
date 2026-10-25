const params = new URLSearchParams(location.search)
const image = document.getElementById('image') as HTMLImageElement
const status = document.getElementById('status') as HTMLParagraphElement

document.title = params.get('name') || 'Image'
image.alt = document.title
image.title = 'Fit image to window'
image.setAttribute('aria-label', `${document.title}: fit image to window`)

const toggleSize = () => {
  const contained = image.parentElement?.classList.toggle('contained') ?? false
  const action = contained ? 'Show image at full size' : 'Fit image to window'

  image.title = action
  image.setAttribute('aria-label', `${document.title}: ${action}`)
  image.setAttribute('aria-pressed', String(contained))
  window.scrollTo(0, 0)
}

image.onclick = toggleSize

image.onkeydown = (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleSize()
  }
}

image.onload = () => {
  image.hidden = false
  status.hidden = true
}

image.onerror = () => {
  image.hidden = true
  status.hidden = false

  status.textContent =
    'This image could not be loaded. It may have been moved, deleted, or be unsupported.'
}

params.delete('name')
params.set('original', '1')
image.src = `filejam-preview://preview-image?${params}`
