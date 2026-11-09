import {
  type CustomIcon,
  type IconTarget,
  iconTargetKey,
} from '@filejam/server/icons'
import { useQuery } from '@tanstack/react-query'
import {
  createContext,
  lazy,
  type ReactNode,
  Suspense,
  useContext,
  useMemo,
  useState,
} from 'react'
import { queryClient } from '../../queryClient.js'

const IconPicker = lazy(() => import('./IconPicker.js'))
const appearanceKey = ['appearance'] as const
type Appearance = Awaited<ReturnType<Window['filejam']['appearance']['list']>>
type Selection = { target: IconTarget; name: string }
const AppearanceContext = createContext({
  icons: new Map<string, CustomIcon>(),
  edit: (_target: IconTarget, _name: string) => {},
})

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: appearanceKey,
    queryFn: () => window.filejam.appearance.list(),
  })
  const [selection, setSelection] = useState<Selection | null>(null)
  const value = useMemo(
    () => ({
      icons: new Map(
        (data ?? []).flatMap(({ target, icon }) =>
          icon ? [[iconTargetKey(target), icon] as const] : [],
        ),
      ),
      edit: (target: IconTarget, name: string) =>
        setSelection({ target, name }),
    }),
    [data],
  )

  async function save(icon: CustomIcon | null) {
    if (!selection) {
      return
    }

    const key = iconTargetKey(selection.target)

    await queryClient.cancelQueries({ queryKey: appearanceKey })

    const previous = queryClient.getQueryData<Appearance>(appearanceKey)

    queryClient.setQueryData<Appearance>(appearanceKey, (current) => [
      ...(current ?? []).filter((row) => iconTargetKey(row.target) !== key),
      { target: selection.target, icon },
    ])

    try {
      await window.filejam.appearance.set(selection.target, icon)
      setSelection(null)
    } catch (error) {
      queryClient.setQueryData(appearanceKey, previous ?? [])
      throw error
    } finally {
      await queryClient.invalidateQueries({ queryKey: appearanceKey })
    }
  }

  return (
    <AppearanceContext value={value}>
      {children}
      {selection && (
        <Suspense fallback={null}>
          <IconPicker
            key={iconTargetKey(selection.target)}
            name={selection.name}
            current={value.icons.get(iconTargetKey(selection.target)) ?? null}
            onSave={save}
            onClose={() => setSelection(null)}
          />
        </Suspense>
      )}
    </AppearanceContext>
  )
}

export function useAppearance() {
  return useContext(AppearanceContext)
}
