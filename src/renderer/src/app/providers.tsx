import { useState } from 'react'
import { Provider } from 'react-redux'

import { AppRouterContextStore, type AppRouteState } from './router/router-context'
import { store } from './store'

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [routeState, setRouteState] = useState<AppRouteState>({ activeChatId: null })

  return (
    <Provider store={store}>
      <AppRouterContextStore.Provider value={{ routeState, setRouteState }}>
        {children}
      </AppRouterContextStore.Provider>
    </Provider>
  )
}
