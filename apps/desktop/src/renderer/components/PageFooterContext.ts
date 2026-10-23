import { createContext } from 'react'

export type CardSizeControl = {
  size: number
  onChange: (size: number) => void
}

export const PageFooterHostContext = createContext<HTMLDivElement | null>(null)
export const PageCardSizeContext = createContext<
  React.Dispatch<React.SetStateAction<CardSizeControl | null>> | undefined
>(undefined)
