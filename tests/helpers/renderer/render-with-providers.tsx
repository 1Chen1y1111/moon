import { type ReactElement, type PropsWithChildren } from 'react'
import { configureStore, type EnhancedStore } from '@reduxjs/toolkit'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'

import { createDefaultAppSettings } from '@ipc/contracts'
import { settingsReducer, type SettingsState } from '@renderer/entities/settings'

export type TestRootState = {
  settings: SettingsState
}

export type TestStore = EnhancedStore<TestRootState>

type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  preloadedSettings?: Partial<SettingsState>
  store?: TestStore
}

export function createTestStore(preloadedSettings?: Partial<SettingsState>): TestStore {
  const baseSettingsState: SettingsState = {
    activeSection: 'general',
    appSettings: createDefaultAppSettings(),
    loadStatus: 'idle',
    saveStatus: 'idle',
    error: null
  }

  return configureStore({
    reducer: {
      settings: settingsReducer
    },
    preloadedState: {
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
    preloadedSettings,
    store = createTestStore(preloadedSettings),
    ...renderOptions
  }: RenderWithProvidersOptions = {}
): RenderResult & {
  store: TestStore
  user: ReturnType<typeof userEvent.setup>
} {
  function Wrapper({ children }: PropsWithChildren): ReactElement {
    return <Provider store={store}>{children}</Provider>
  }

  return {
    store,
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...renderOptions })
  }
}
