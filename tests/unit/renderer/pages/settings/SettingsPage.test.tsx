import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppSettings, type AppSettings } from '@ipc/contracts'
import { SettingsPage } from '@renderer/pages/settings/SettingsPage'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'

describe('SettingsPage', () => {
  let api: MockMoonApi
  const savedSettings: AppSettings = {
    ...createDefaultAppSettings(),
    providers: {
      ...createDefaultAppSettings().providers,
      claude: {
        provider: 'claude',
        hasApiKey: true,
        apiKeyPreview: '****demo',
        model: 'claude-3-7-sonnet-latest',
        baseUrl: '',
        updatedAt: '2026-04-21T00:00:00.000Z'
      }
    }
  }

  beforeEach(() => {
    window.location.hash = ''
    api = installMockWindowApi({ savedSettings })
  })

  it('renders mac controls in the sidebar and windows controls in the right header', () => {
    renderWithProviders(<SettingsPage />)

    const sidebarShell = screen.getByTestId('settings-sidebar-shell')

    expect(screen.getByRole('tab', { name: '通用' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('工具模型')).toBeInTheDocument()
    expect(sidebarShell).toHaveClass(
      'border-moon-sidebar-border',
      'bg-moon-sidebar-bg',
      'py-moon-option-gap'
    )
    expect(within(sidebarShell).getByRole('button', { name: '切换缩放窗口' })).toBeInTheDocument()
    expect(within(sidebarShell).getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放大窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('keeps the header and footer fixed while the sidebar and content own scrolling', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

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
    const { user } = renderWithProviders(<SettingsPage />)

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

    expect(api.settings.saveProvider).toHaveBeenCalledWith({
      provider: 'claude',
      apiKey: 'sk-ant-demo',
      model: 'claude-3-7-sonnet-latest',
      baseUrl: ''
    })
  })

  it('keeps saved API keys out of renderer form values', async () => {
    const existingSettings: AppSettings = {
      ...createDefaultAppSettings(),
      providers: {
        ...createDefaultAppSettings().providers,
        openai: {
          provider: 'openai',
          hasApiKey: true,
          apiKeyPreview: '****demo',
          model: 'gpt-5.4',
          baseUrl: '',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      }
    }

    api = installMockWindowApi({
      appSettings: existingSettings,
      savedSettings: existingSettings
    })

    const { user } = renderWithProviders(<SettingsPage />, {
      preloadedSettings: {
        activeSection: 'providers',
        appSettings: existingSettings,
        loadStatus: 'succeeded'
      }
    })

    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('')
    expect(screen.queryByDisplayValue('sk-openai-demo')).not.toBeInTheDocument()
    expect(screen.getByText('Current key: ****demo')).toBeInTheDocument()

    await user.click(
      within(screen.getByRole('region', { name: 'OpenAI provider settings' })).getByRole('button')
    )

    await waitFor(() => {
      expect(api.settings.saveProvider).toHaveBeenCalledWith({
        provider: 'openai',
        apiKey: '',
        model: 'gpt-5.4',
        baseUrl: ''
      })
    })
  })

  it('renders user interface theme choices and saves the selected theme', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '用户界面' }))

    expect(screen.getAllByRole('heading', { name: '用户界面' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '浅色' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '深色' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跟随系统' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('appearance-preview-light')).toBeInTheDocument()
    expect(screen.getByTestId('appearance-preview-dark')).toBeInTheDocument()
    expect(screen.getByTestId('appearance-preview-system')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '深色' }))

    await waitFor(() => {
      expect(api.settings.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
    })
  })

  it('validates the compatible provider base url before saving', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

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
    expect(api.settings.saveProvider).not.toHaveBeenCalled()
  })

  it('keeps unsaved provider drafts when another provider is saved', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

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
      expect(api.settings.saveProvider).toHaveBeenCalledWith({
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
