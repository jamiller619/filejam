import { useEffect, useRef } from 'react'

export default function useResizeHandler(callback: (inPixels: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  return ({ inPixels }: { inPixels: number }) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      callback(inPixels)
    }, 3000)
  }
}
