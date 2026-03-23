import { configureStore, type EnhancedStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import type { SettingsState } from './model/settings.types'
import { settingsReducer } from './model/slices'
import { SettingsDialog } from './SettingsDialog'

type SettingsDialogTestStore = EnhancedStore<{
  settings: SettingsState
}>

function createTestStore(preloadedSettings?: Partial<SettingsState>): SettingsDialogTestStore {
  const baseSettingsState: SettingsState = {
    activeSection: 'general',
    isOpen: true
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

function renderDialog(preloadedSettings?: Partial<SettingsState>): {
  store: SettingsDialogTestStore
  user: ReturnType<typeof userEvent.setup>
} {
  const store = createTestStore(preloadedSettings)

  render(
    <Provider store={store}>
      <SettingsDialog />
    </Provider>
  )

  return {
    store,
    user: userEvent.setup()
  }
}

describe('SettingsDialog', () => {
  it('renders the rebuilt settings shell with the general page active', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Agents' })).toBeInTheDocument()
    expect(screen.getByText('工具模型')).toBeInTheDocument()
    expect(screen.getByText('Coding Agent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭设置' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('switches sections and shows placeholder content for non-general pages', async () => {
    const { store, user } = renderDialog()

    await user.click(screen.getByRole('tab', { name: '提供商' }))

    expect(store.getState().settings.activeSection).toBe('providers')
    expect(screen.getByRole('heading', { name: '提供商' })).toBeInTheDocument()
    expect(screen.getByText('页面内容待补齐')).toBeInTheDocument()
  })

  it('closes the dialog from the dismiss action', async () => {
    const { store, user } = renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭设置' }))

    expect(store.getState().settings.isOpen).toBe(false)
    expect(screen.queryByRole('dialog', { name: '设置' })).not.toBeInTheDocument()
  })
})
