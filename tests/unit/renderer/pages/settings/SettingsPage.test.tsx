import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SettingsPage } from '@renderer/pages/settings/SettingsPage'
import { createProviderProxyEndpoints } from '@shared/domain/provider-proxy'
import { createDefaultAppSettings, type AppSettings } from '@shared/domain/settings'
import { installMockWindowApi, type MockMoonApi } from '@tests/helpers/renderer/mock-window-api'
import { renderWithProviders } from '@tests/helpers/renderer/render-with-providers'

describe('SettingsPage', () => {
  let api: MockMoonApi
  const defaultSettings = createDefaultAppSettings()
  const savedSettings: AppSettings = {
    ...defaultSettings,
    providers: {
      ...defaultSettings.providers,
      claude: {
        ...defaultSettings.providers.claude,
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

  function getProviderCatalogItem(name: string): HTMLElement {
    const providerList = screen.getByRole('list', { name: '提供商列表' })
    const item = within(providerList)
      .getAllByText(name)
      .map((element) => element.closest('[aria-pressed]'))
      .find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element.getAttribute('aria-label') === `选择 ${name}`
      )

    expect(item).not.toBeNull()

    return item
  }

  it('renders mac controls in the sidebar and windows controls in the right header', () => {
    renderWithProviders(<SettingsPage />)

    const sidebarShell = screen.getByTestId('settings-sidebar-shell')

    const activeGeneralTab = screen.getByRole('tab', { name: '通用' })

    expect(activeGeneralTab).toHaveAttribute('aria-selected', 'true')
    expect(activeGeneralTab).toHaveClass(
      '[-webkit-app-region:no-drag]',
      'relative',
      'z-20',
      'border-input',
      'bg-secondary',
      'text-foreground'
    )
    expect(activeGeneralTab).not.toHaveClass('hover:bg-accent')
    expect(screen.getByText('工具模型')).toBeInTheDocument()
    expect(sidebarShell).toHaveClass('relative', 'z-30', 'w-56', 'p-3')
    expect(within(sidebarShell).getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放大窗口' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('does not reload settings from the page boundary', () => {
    renderWithProviders(<SettingsPage />)

    expect(api.settings.get).not.toHaveBeenCalled()
  })

  it('keeps the header and footer fixed while the sidebar and content own scrolling', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    const sidebarTablist = screen.getByRole('tablist', { name: '设置分类' })
    const footerButton = screen.getByRole('button', { name: '保存' })
    const headerTitle = screen.getByRole('heading', { name: '通用' })

    expect(sidebarTablist.closest('[data-slot="scroll-area"]')).toHaveClass('min-h-0', 'flex-1')
    expect(sidebarTablist).not.toHaveClass('overflow-visible')
    expect(footerButton).toBeInTheDocument()
    expect(headerTitle).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '关于' }))

    const contentScrollRegion = screen.getByTestId('settings-content-scroll')

    expect(contentScrollRegion).toHaveClass('flex-1', 'px-6', 'py-6')
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByText('页面内容待补齐')).toBeInTheDocument()
  })

  it('renders the provider catalog and saves the selected provider from the footer', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '提供商' }))

    expect(screen.getAllByRole('heading', { name: '提供商' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('搜索提供商')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Custom ACP Provider' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add Custom Provider' })).toBeEnabled()
    expect(getProviderCatalogItem('Moonshot')).toBeInTheDocument()
    expect(getProviderCatalogItem('CPA')).toBeInTheDocument()
    const openAiProviderButton = getProviderCatalogItem('OpenAI')

    expect(openAiProviderButton).toHaveAttribute('aria-pressed', 'true')
    expect(openAiProviderButton.querySelector('svg')).toBeInTheDocument()
    expect(getProviderCatalogItem('Anthropic')).toBeInTheDocument()
    expect(getProviderCatalogItem('Google Gemini')).toBeInTheDocument()
    expect(getProviderCatalogItem('DeepSeek')).toBeInTheDocument()
    expect(getProviderCatalogItem('Azure OpenAI')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'OpenAI provider details' })).toBeInTheDocument()
    expect(screen.queryByLabelText('OpenAI Provider Name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('OpenAI API Key')).toBeInTheDocument()

    const openAiProxyEndpoints = createProviderProxyEndpoints('openai')
    const proxyToggle = screen.getByText('API 代理端点').closest('[aria-expanded]')

    expect(proxyToggle).not.toBeNull()
    await user.click(proxyToggle as HTMLElement)
    expect(screen.getByText('OpenAI Responses API 代理')).toBeInTheDocument()
    expect(screen.getByText(openAiProxyEndpoints.responsesUrl)).toBeInTheDocument()
    expect(screen.getByText(openAiProxyEndpoints.anthropicMessagesUrl)).toBeInTheDocument()
    expect(screen.getByText(/export ANTHROPIC_BASE_URL=/)).toHaveTextContent(
      openAiProxyEndpoints.anthropicBaseUrl
    )

    fireEvent.change(screen.getByLabelText('搜索提供商'), { target: { value: 'deep' } })
    expect(getProviderCatalogItem('DeepSeek')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '提供商列表' })).queryByText('OpenAI')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索提供商'), { target: { value: '' } })

    await user.click(screen.getByRole('button', { name: 'Add Custom Provider' }))
    expect(screen.getByLabelText('Custom Provider Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Custom Provider API Format')).toBeInTheDocument()
    expect(screen.getByLabelText('Custom Provider Headers')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Custom Provider Name'), { target: { value: 'My API' } })
    fireEvent.change(screen.getByLabelText('Custom Provider Base URL'), {
      target: { value: 'https://api.example.com/v1' }
    })
    fireEvent.change(screen.getByLabelText('Custom Provider API Key'), {
      target: { value: 'sk-custom-demo' }
    })
    const addProviderButton = screen.getByRole('button', { name: 'Add Provider' })
    await waitFor(() => {
      expect(addProviderButton).toBeEnabled()
    })
    await user.click(addProviderButton)

    await waitFor(() => {
      expect(api.settings.createCustomProvider).toHaveBeenCalledWith({
        name: 'My API',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-custom-demo',
        apiFormat: 'openai-chat',
        useMaxCompletionTokens: false,
        customHeaders: ''
      })
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('Custom Provider Name')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('OpenAI API Key'), {
      target: { value: 'sk-openai-demo' }
    })
    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await user.click(saveButton)

    expect(api.settings.saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-openai-demo',
        model: 'gpt-5.4',
        baseUrl: ''
      })
    )
  }, 10000)

  it('keeps saved API keys out of renderer form values', async () => {
    const defaultSettings = createDefaultAppSettings()
    const existingSettings: AppSettings = {
      ...defaultSettings,
      providers: {
        ...defaultSettings.providers,
        openai: {
          ...defaultSettings.providers.openai,
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
    expect(screen.getByText('当前密钥：****demo')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('OpenAI Base URL'), {
      target: { value: 'https://api.openai.com/v1' }
    })
    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await user.click(saveButton)

    await waitFor(() => {
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          apiKey: '',
          model: 'gpt-5.4',
          baseUrl: 'https://api.openai.com/v1'
        })
      )
    })
  })

  it('renders user interface theme choices and saves the selected theme', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '用户界面' }))

    expect(screen.getAllByRole('heading', { name: '用户界面' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '浅色' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '深色' })).toBeInTheDocument()
    const activeThemeButton = screen.getByRole('button', { name: '跟随系统' })

    expect(activeThemeButton).toHaveAttribute('aria-pressed', 'true')
    expect(activeThemeButton).toHaveClass('border-input', 'text-foreground')
    expect(activeThemeButton).not.toHaveClass('shadow-moon-ring')

    const previewColorValues = (preview: HTMLElement): string[] =>
      Array.from(preview.querySelectorAll<SVGElement>('[fill],[stroke]')).flatMap((node) =>
        [node.getAttribute('fill'), node.getAttribute('stroke')].filter((value): value is string =>
          Boolean(value)
        )
      )
    const lightPreview = screen.getByTestId('appearance-preview-light')
    const darkPreview = screen.getByTestId('appearance-preview-dark')
    const systemPreview = screen.getByTestId('appearance-preview-system')

    expect(lightPreview).toBeInTheDocument()
    expect(darkPreview).toHaveClass('dark')
    expect(systemPreview.querySelector('g.dark')).toBeInTheDocument()

    for (const preview of [lightPreview, darkPreview, systemPreview]) {
      expect(previewColorValues(preview).length).toBeGreaterThan(0)
    }

    await user.click(screen.getByRole('button', { name: '深色' }))

    await waitFor(() => {
      expect(api.settings.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
    })
  })

  it('validates the compatible provider base url before saving', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '提供商' }))
    await user.click(getProviderCatalogItem('CPA'))
    fireEvent.change(screen.getByLabelText('CPA API Key'), {
      target: { value: 'sk-compatible-demo' }
    })
    await user.click(
      within(screen.getByRole('region', { name: 'CPA provider details' })).getByRole('switch', {
        name: '启用提供商'
      })
    )
    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await user.click(saveButton)

    expect(screen.getByText('Base URL is required.')).toBeInTheDocument()
    expect(api.settings.saveProvider).not.toHaveBeenCalled()
  })

  it('renders OAuth and built-in ACP providers as enable cards', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '提供商' }))
    await user.click(getProviderCatalogItem('GitHub Copilot'))

    const copilotRegion = screen.getByRole('region', {
      name: 'GitHub Copilot provider details'
    })

    expect(
      within(copilotRegion).getByRole('button', { name: 'Enable Provider' })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('GitHub Copilot API Key')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('GitHub Copilot Model ID')).not.toBeInTheDocument()

    await user.click(getProviderCatalogItem('Claude Code (ACP)'))

    const acpRegion = screen.getByRole('region', {
      name: 'Claude Code (ACP) provider details'
    })

    expect(within(acpRegion).getByRole('button', { name: 'Enable Provider' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Claude Code (ACP) ACP Command')).not.toBeInTheDocument()
  })

  it('keeps unsaved provider drafts when another provider is saved', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '提供商' }))
    fireEvent.change(screen.getByLabelText('OpenAI API Key'), {
      target: { value: 'sk-openai-demo' }
    })
    fireEvent.change(screen.getByLabelText('OpenAI Base URL'), {
      target: { value: 'https://api.openai.com/v1' }
    })
    await user.click(getProviderCatalogItem('Anthropic'))
    fireEvent.change(screen.getByLabelText('Anthropic API Key'), {
      target: { value: 'sk-ant-demo' }
    })
    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await user.click(saveButton)

    await waitFor(() => {
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'claude',
          apiKey: 'sk-ant-demo',
          model: '',
          baseUrl: ''
        })
      )
    })
    await user.click(getProviderCatalogItem('OpenAI'))
    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('sk-openai-demo')
    expect(screen.getByLabelText('OpenAI Base URL')).toHaveValue('https://api.openai.com/v1')
  }, 10000)
})
