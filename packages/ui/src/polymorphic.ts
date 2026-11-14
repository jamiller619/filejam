import type { ComponentPropsWithRef, ElementType } from 'react'

export type PolymorphicProps<T extends ElementType, Props = {}> = Props & {
  as?: T
} & Omit<ComponentPropsWithRef<T>, keyof Props | 'as'>
