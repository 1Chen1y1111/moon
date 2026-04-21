import { configureStore, type EnhancedStore } from '@reduxjs/toolkit'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultAppSettings, type AppSettings } from '@shared/ipc/contracts'
import { SettingsPage } from '@renderer/pages/settings/SettingsPage'

import type { SettingsState } from './model/settings.types'
import { settingsReducer } from './model/slices'

type SettingsPageTestStore = EnhancedStore<{
  settings: SettingsState
}>

function createTestStore(preloadedSettings?: Partial<SettingsState>): SettingsPageTestStore {
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
  const savedSettings: AppSettings = {
    ...createDefaultAppSettings(),
    providers: {
      ...createDefaultAppSettings().providers,
      claude: {
        provider: 'claude',
        apiKey: 'sk-ant-demo',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: '',
        updatedAt: '2026-04-21T00:00:00.000Z'
      }
    }
  }

  beforeEach(() => {
    window.location.hash = ''
    ;(window as Window & { api: Record<string, unknown> }).api = {
      settings: {
        get: vi.fn().mockResolvedValue(createDefaultAppSettings()),
        saveProvider: vi.fn().mockResolvedValue(savedSettings)
      },
      windowControls: {
        close: vi.fn(),
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        openSettings: vi.fn(),
        getState: vi.fn().mockResolvedValue({ isMaximized: false }),
        onStateChange: vi.fn().mockReturnValue(() => undefined)
      }
    }
  })

  it('renders mac controls in the sidebar and windows controls in the right header', () => {
    renderSettingsPage()

    const sidebarShell = screen.getByTestId('settings-sidebar-shell')

    expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('工具模型')).toBeInTheDocument()
    expect(sidebarShell).toHaveClass('border-moon-sidebar-border', 'bg-moon-sidebar-bg', 'py-3')
    expect(within(sidebarShell).getByRole('button', { name: '切换缩放窗口' })).toBeInTheDocument()
    expect(within(sidebarShell).getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放大窗口' })).toBeInTheDocument()
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

  it('renders provider forms and saves a provider through the settings api', async () => {
    const { user } = renderSettingsPage()

    await user.click(screen.getByRole('tab', { name: '提供商' }))

    expect(screen.getAllByRole('heading', { name: '提供商' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Claude API Key')).toBeInTheDocument()
    expect(screen.getByLabelText('OpenAI API Key')).toBeInTheDocument()
    expect(screen.getByLabelText('Gemini API Key')).toBeInTheDocument()
    expect(screen.getByLabelText('OpenAI Compatible Base URL')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Claude API Key'), 'sk-ant-demo')
    await user.type(screen.getByLabelText('Claude Model'), 'claude-3-7-sonnet-latest')
    await user.click(
      within(screen.getByRole('region', { name: 'Claude provider settings' })).getByRole('button', {
        name: '保存'
      })
    )

    expect(window.api.settings.saveProvider).toHaveBeenCalledWith({
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    })
  })

  it('validates the compatible provider base url before saving', async () => {
    const { user } = renderSettingsPage()

    await user.click(screen.getByRole('tab', { name: '提供商' }))
    await user.type(screen.getByLabelText('OpenAI Compatible API Key'), 'sk-compatible-demo')
    await user.type(screen.getByLabelText('OpenAI Compatible Model'), 'gpt-compatible')
    await user.click(
      within(screen.getByRole('region', { name: 'OpenAI Compatible provider settings' })).getByRole(
        'button',
        {
          name: '保存'
        }
      )
    )

    expect(screen.getByText('Base URL is required.')).toBeInTheDocument()
    expect(window.api.settings.saveProvider).not.toHaveBeenCalled()
  })

  it('keeps unsaved provider drafts when another provider is saved', async () => {
    const { user } = renderSettingsPage()

    await user.click(screen.getByRole('tab', { name: '提供商' }))
    await user.type(screen.getByLabelText('OpenAI API Key'), 'sk-openai-demo')
    await user.type(screen.getByLabelText('OpenAI Model'), 'gpt-5.4')
    await user.type(screen.getByLabelText('Claude API Key'), 'sk-ant-demo')
    await user.type(screen.getByLabelText('Claude Model'), 'claude-3-7-sonnet-latest')
    await user.click(
      within(screen.getByRole('region', { name: 'Claude provider settings' })).getByRole('button', {
        name: '保存'
      })
    )

    await waitFor(() => {
      expect(window.api.settings.saveProvider).toHaveBeenCalledWith({
        provider: 'claude',
        apiKey: 'sk-ant-demo',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: ''
      })
    })
    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('sk-openai-demo')
    expect(screen.getByLabelText('OpenAI Model')).toHaveValue('gpt-5.4')
  })
})
