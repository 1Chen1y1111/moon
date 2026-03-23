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
    activeSection: 'general'
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
  it('renders the settings shell without modal framing and keeps the shell split layout', () => {
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

  it('keeps the header and footer fixed while the sidebar and content own scrolling', async () => {
    const { user } = renderSettingsPage()

    const sidebarTablist = screen.getByRole('tablist', { name: '设置分类' })
    const footerButton = screen.getByRole('button', { name: '保存' })
    const headerTitle = screen.getByRole('heading', { name: '通用' })

    expect(sidebarTablist).toHaveClass('overflow-y-auto')
    expect(sidebarTablist).not.toHaveClass('overflow-visible')
    expect(footerButton).toBeInTheDocument()
    expect(headerTitle).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '关于' }))

    const contentScrollRegion = screen.getByTestId('settings-content-scroll')

    expect(contentScrollRegion).toHaveClass('overflow-y-auto')
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByText('页面内容待补齐')).toBeInTheDocument()
  })
})
