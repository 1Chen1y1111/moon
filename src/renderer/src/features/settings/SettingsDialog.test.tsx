import { configureStore, type EnhancedStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { providersReducer } from '@renderer/features/providers'
import { SettingsPage } from '@renderer/pages/settings/SettingsPage'

import type { SettingsState } from './model/settings.types'
import { settingsReducer } from './model/slices'

type SettingsPageTestStore = EnhancedStore<{
  providers: ReturnType<typeof providersReducer>
  settings: SettingsState
}>

function createTestStore(preloadedSettings?: Partial<SettingsState>): SettingsPageTestStore {
  const baseSettingsState: SettingsState = {
    activeSection: 'general',
    isOpen: false
  }

  return configureStore({
    reducer: {
      settings: settingsReducer,
      providers: providersReducer
    },
    preloadedState: {
      settings: {
        ...baseSettingsState,
        ...preloadedSettings
      }
    }
  })
}

function renderSettingsPage(preloadedSettings?: Partial<SettingsState>): {
  store: SettingsPageTestStore
  user: ReturnType<typeof userEvent.setup>
} {
  const store = createTestStore(preloadedSettings)

  render(
    <Provider store={store}>
      <SettingsPage />
    </Provider>
  )

  return {
    store,
    user: userEvent.setup()
  }
}

describe('SettingsPage', () => {
  it('renders the settings shell as a page surface instead of a modal', () => {
    renderSettingsPage()

    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Chrome Relay' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByText('工具模型')).toBeInTheDocument()
    expect(screen.getByText('Coding Agent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('switches sections and shows placeholder content in the settings page shell', async () => {
    const { store, user } = renderSettingsPage()

    await user.click(screen.getByRole('tab', { name: '关于' }))

    expect(store.getState().settings.activeSection).toBe('about')
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByText('页面内容待补齐')).toBeInTheDocument()
  })
})
