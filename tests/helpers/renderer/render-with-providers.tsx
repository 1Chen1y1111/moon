import { useState, type ReactElement, type PropsWithChildren } from 'react'
import { configureStore, type EnhancedStore } from '@reduxjs/toolkit'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'

import { AppRouterContextStore, type AppRouteState } from '@renderer/app/router/router-context'
import { chatReducer, type ChatState } from '@renderer/entities/chat'
import { settingsReducer, type SettingsState } from '@renderer/entities/settings'
import { TooltipProvider } from '@shadcn/ui/tooltip'
import { createDefaultAppSettings } from '@shared/domain/settings'

type TestRootState = {
  chat: ChatState
  settings: SettingsState
}

type TestStore = EnhancedStore<TestRootState>

type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  preloadedChat?: Partial<ChatState>
  preloadedSettings?: Partial<SettingsState>
  routeState?: AppRouteState
  store?: TestStore
}

function createTestStore(
  preloadedChat?: Partial<ChatState>,
  preloadedSettings?: Partial<SettingsState>
): TestStore {
  const baseChatState: ChatState = {
    activeSessionId: null,
    sessions: [],
    messages: [],
    sessionsStatus: 'idle',
    messagesStatus: 'idle',
    createStatus: 'idle',
    sendStatus: 'idle',
    messagesRequestId: null,
    streamingAssistantMessageId: null,
    error: null
  }
  const baseSettingsState: SettingsState = {
    activeSection: 'general',
    appSettings: createDefaultAppSettings(),
    loadStatus: 'idle',
    saveStatus: 'idle',
    error: null
  }

  return configureStore({
    reducer: {
      chat: chatReducer,
      settings: settingsReducer
    },
    preloadedState: {
      chat: {
        ...baseChatState,
        ...preloadedChat
      },
      settings: {
        ...baseSettingsState,
        ...preloadedSettings
      }
    }
  })
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedChat,
    preloadedSettings,
    routeState = { activeChatId: null },
    store = createTestStore(preloadedChat, preloadedSettings),
    ...renderOptions
  }: RenderWithProvidersOptions = {}
): RenderResult & {
  store: TestStore
  user: ReturnType<typeof userEvent.setup>
} {
  function Wrapper({ children }: PropsWithChildren): ReactElement {
    const [currentRouteState, setRouteState] = useState(routeState)

    return (
      <Provider store={store}>
        <AppRouterContextStore.Provider value={{ routeState: currentRouteState, setRouteState }}>
          <TooltipProvider>{children}</TooltipProvider>
        </AppRouterContextStore.Provider>
      </Provider>
    )
  }

  return {
    store,
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...renderOptions })
  }
}
