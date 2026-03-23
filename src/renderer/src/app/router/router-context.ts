import { createContext, useContext } from 'react'

export type AppRouteState = {
  activeChatId: string | null
}

export type AppRouterContext = {
  routeState: AppRouteState
  setRouteState: React.Dispatch<React.SetStateAction<AppRouteState>>
}

export const AppRouterContextStore = createContext<AppRouterContext | null>(null)

export function useAppRouterContext(): AppRouterContext {
  const context = useContext(AppRouterContextStore)
  if (context === null) {
    throw new Error('useAppRouterContext must be used within AppProviders')
  }

  return context
}
