import { createContext, useContext } from 'react'

type DetailsPaneState = {
  host: HTMLElement | null
  setVisible: (visible: boolean) => void
}

export const DetailsPaneContext = createContext<DetailsPaneState | null>(null)

export function useDetailsPane() {
  const context = useContext(DetailsPaneContext)

  if (!context)
    throw new Error('File details must render inside the app layout')

  return context
}
