import { useState, type PropsWithChildren, type ReactElement } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AppRouterContextStore, type AppRouteState } from '@renderer/app/router/router-context'
import { resetChatStore, type ChatState } from '@renderer/store/chat'
import { resetSettingsStore, type SettingsState } from '@renderer/store/settings'
import { TooltipProvider } from '@shadcn/ui/tooltip'

type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  preloadedChat?: Partial<ChatState>
  preloadedSettings?: Partial<SettingsState>
  routeState?: AppRouteState
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedChat,
    preloadedSettings,
    routeState = { activeChatId: null },
    ...renderOptions
  }: RenderWithProvidersOptions = {}
): RenderResult & {
  user: ReturnType<typeof userEvent.setup>
} {
  resetChatStore(preloadedChat)
  resetSettingsStore(preloadedSettings)

  function Wrapper({ children }: PropsWithChildren): ReactElement {
    const [currentRouteState, setRouteState] = useState(routeState)

    return (
      <AppRouterContextStore.Provider value={{ routeState: currentRouteState, setRouteState }}>
        <TooltipProvider>{children}</TooltipProvider>
      </AppRouterContextStore.Provider>
    )
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...renderOptions })
  }
}
