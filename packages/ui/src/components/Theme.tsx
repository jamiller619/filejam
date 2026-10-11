// import '../style/index.css'
import { css } from 'inline-css-modules'

css`
  body {
    font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--text);
  }

  *,
  *::before,
  *::after {
    border: 0;
  }
`

export default function Theme(props: { children: React.ReactNode }) {
  return props.children
}
