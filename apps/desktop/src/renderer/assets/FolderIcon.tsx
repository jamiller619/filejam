import type { SVGProps } from 'react'

type FolderIconProps = SVGProps<SVGSVGElement> & {
  title?: string
}

export default function FolderIcon({ title, ...props }: FolderIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" {...props}>
      <title>{title}</title>
      <path
        d="M24 60c0-6.6 5.4-12 12-12h59c4.2.2 8.1 2 11 5l13 13c2.3 2.6 5.6 4 9 4h92c6.6 0 12 5.4 12 12v118c0 8.8-7.2 16-16 16H40c-8.8 0-16-7.2-16-16V60z"
        style={{ fill: '#3499d1' }}
      />
      <linearGradient
        id="a"
        gradientUnits="userSpaceOnUse"
        x1="128"
        y1="175.89"
        x2="128"
        y2="39.89"
        gradientTransform="matrix(1 0 0 -1 0 255.89)"
      >
        <stop offset="0" style={{ stopColor: '#8edbfa' }} />
        <stop offset="1" style={{ stopColor: '#4dafe8' }} />
      </linearGradient>
      <path
        d="M40 82h176c8.8 0 16 7.2 16 16v102c0 8.8-7.2 16-16 16H40c-8.8 0-16-7.2-16-16V98c0-8.8 7.2-16 16-16z"
        style={{ fill: 'url(#a)' }}
      />
      <path
        d="M25 98h0c0-8.3 6.7-15 15-15h176c8.3 0 15 6.7 15 15h0"
        style={{
          fill: 'none',
          stroke: '#bdeeff',
          strokeWidth: 2,
          strokeLinecap: 'round',
        }}
      />
    </svg>
  )
}
