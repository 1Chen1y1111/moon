import { createContext, useContext, useState } from 'react'

export type AppRouteState = {
  activeChatId: string | null
}

export type AppRouterContext = {
  routeState: AppRouteState
  setRouteState: React.Dispatch<React.SetStateAction<AppRouteState>>
}

const AppRouterContextStore = createContext<AppRouterContext | null>(null)

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [routeState, setRouteState] = useState<AppRouteState>({ activeChatId: null })

  return (
    <AppRouterContextStore.Provider value={{ routeState, setRouteState }}>
      {children}
    </AppRouterContextStore.Provider>
  )
}

export function useAppRouterContext(): AppRouterContext {
  const context = useContext(AppRouterContextStore)
  if (context === null) {
    throw new Error('useAppRouterContext must be used within AppProviders')
  }

  return context
}
