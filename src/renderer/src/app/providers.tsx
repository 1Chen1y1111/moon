import { useState } from 'react'

import { AppRouterContextStore, type AppRouteState } from './router-context'

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [routeState, setRouteState] = useState<AppRouteState>({ activeChatId: null })

  return (
    <AppRouterContextStore.Provider value={{ routeState, setRouteState }}>
      {children}
    </AppRouterContextStore.Provider>
  )
}
