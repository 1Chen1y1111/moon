import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SettingsPage } from '@renderer/pages/settings/SettingsPage'
import { Toaster } from '@shadcn/ui/sonner'
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
        apiKey: 'sk-ant-demo',
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

  it('keeps the header and footer fixed while switching content containers', async () => {
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

    expect(contentScrollRegion).toHaveAttribute('data-slot', 'scroll-area')
    expect(contentScrollRegion).toHaveClass('flex-1', 'px-6', 'py-6')
    expect(screen.queryByTestId('settings-content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '关于' })).toBeInTheDocument()
    expect(screen.getByText('页面内容待补齐')).toBeInTheDocument()
  })

  it('renders providers content in a div', () => {
    renderWithProviders(<SettingsPage />, {
      preloadedSettings: {
        activeSection: 'providers'
      }
    })

    const contentRegion = screen.getByTestId('settings-content')

    expect(contentRegion).toHaveClass('flex-1', 'px-6', 'py-6')
    expect(contentRegion).not.toHaveAttribute('data-slot', 'scroll-area')
    expect(screen.queryByTestId('settings-content-scroll')).not.toBeInTheDocument()
  })

  it('renders the provider catalog and saves the selected provider from the footer', async () => {
    const { user } = renderWithProviders(<SettingsPage />)

    await user.click(screen.getByRole('tab', { name: '提供商' }))

    expect(screen.getAllByRole('heading', { name: '提供商' }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('搜索提供商')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Custom ACP Provider' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add Custom Provider' })).toBeEnabled()
    expect(getProviderCatalogItem('Moonshot')).toBeInTheDocument()
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
    expect(screen.queryByText('Models')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无模型')).not.toBeInTheDocument()

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
    expect(
      within(screen.getByRole('list', { name: '提供商列表' })).queryByText('OpenAI')
    ).not.toBeInTheDocument()
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
    expect(screen.getByText('Models')).toBeInTheDocument()
    expect(screen.getByText('暂无模型')).toBeInTheDocument()
    expect(screen.getByText('点击 Fetch 拉取可用模型。')).toBeInTheDocument()
    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await user.click(saveButton)

    expect(api.settings.saveProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-openai-demo',
        model: '',
        baseUrl: ''
      })
    )
  }, 10000)

  it('fills saved API keys into renderer form values', async () => {
    const defaultSettings = createDefaultAppSettings()
    const existingSettings: AppSettings = {
      ...defaultSettings,
      providers: {
        ...defaultSettings.providers,
        openai: {
          ...defaultSettings.providers.openai,
          provider: 'openai',
          hasApiKey: true,
          apiKey: 'sk-openai-demo',
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

    expect(screen.getByLabelText('OpenAI API Key')).toHaveValue('sk-openai-demo')
    expect(screen.queryByText(/^当前密钥：/)).not.toBeInTheDocument()

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
          apiKey: 'sk-openai-demo',
          model: 'gpt-5.4',
          baseUrl: 'https://api.openai.com/v1'
        })
      )
    })
  })

  it('configures model capabilities from the model list', async () => {
    const defaultSettings = createDefaultAppSettings()
    const existingSettings: AppSettings = {
      ...defaultSettings,
      providers: {
        ...defaultSettings.providers,
        openai: {
          ...defaultSettings.providers.openai,
          provider: 'openai',
          hasApiKey: true,
          apiKey: 'sk-openai-demo',
          model: 'kimi-k2.5',
          models: [
            {
              id: 'kimi-k2.5',
              name: 'kimi-k2.5',
              enabled: true,
              isManual: true,
              supportsVision: true,
              supportsImageOutput: false,
              supportsToolCalling: false,
              supportsReasoning: false,
              supportsEmbedding: false,
              contextWindow: 262_144,
              maxOutputTokens: 262_144,
              providerOptions: '{\n\n}'
            }
          ],
          availableModels: [
            {
              id: 'kimi-k2.5',
              name: 'kimi-k2.5',
              enabled: true,
              isManual: true,
              supportsVision: true,
              supportsImageOutput: false,
              supportsToolCalling: false,
              supportsReasoning: false,
              supportsEmbedding: false,
              contextWindow: 262_144,
              maxOutputTokens: 262_144,
              providerOptions: '{\n\n}'
            }
          ],
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

    expect(screen.getByText('kimi-k2.5')).toBeInTheDocument()
    expect(screen.getByLabelText('Supports image input')).toBeInTheDocument()
    expect(screen.getByLabelText('Supports function calling')).toBeInTheDocument()
    expect(screen.getByLabelText('Extended thinking/reasoning')).toBeInTheDocument()
    expect(screen.getByLabelText('Supports function calling')).toHaveClass('text-primary')
    expect(screen.getByLabelText('Extended thinking/reasoning')).toHaveClass('text-primary')
    expect(screen.getByLabelText('262,144 token context window')).toBeInTheDocument()
    expect(screen.getByText('262K')).toBeInTheDocument()
    await user.hover(screen.getByLabelText('Supports function calling'))
    expect((await screen.findAllByText('Supports function calling')).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '配置模型 kimi-k2.5' }))
    expect(screen.getByRole('dialog', { name: 'Model Options' })).toBeInTheDocument()
    expect(screen.getByLabelText('kimi-k2.5 supports vision')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByLabelText('kimi-k2.5 supports tool calling')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByLabelText('kimi-k2.5 supports reasoning')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await user.click(screen.getByLabelText('kimi-k2.5 supports image output'))
    await user.click(screen.getByLabelText('kimi-k2.5 supports embedding'))
    await user.clear(screen.getByLabelText('kimi-k2.5 context window'))
    await user.type(screen.getByLabelText('kimi-k2.5 context window'), '131072')
    await user.clear(screen.getByLabelText('kimi-k2.5 max output tokens'))
    await user.type(screen.getByLabelText('kimi-k2.5 max output tokens'), '8192')
    fireEvent.change(screen.getByLabelText('kimi-k2.5 provider options json'), {
      target: { value: '{ "thinking": { "type": "disabled" } }' }
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
    await user.click(saveButton)

    await waitFor(() => {
      expect(api.settings.saveProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          models: [
            expect.objectContaining({
              id: 'kimi-k2.5',
              supportsVision: true,
              supportsImageOutput: true,
              supportsToolCalling: true,
              supportsReasoning: true,
              supportsEmbedding: true,
              contextWindow: 131_072,
              maxOutputTokens: 8192,
              providerOptions: '{ "thinking": { "type": "disabled" } }',
              manualOverrides: expect.arrayContaining([
                'supportsImageOutput',
                'supportsEmbedding',
                'contextWindow',
                'maxOutputTokens',
                'providerOptions'
              ])
            })
          ],
          availableModels: [
            expect.objectContaining({
              id: 'kimi-k2.5',
              supportsVision: true,
              supportsImageOutput: true,
              supportsToolCalling: true,
              supportsReasoning: true,
              supportsEmbedding: true,
              contextWindow: 131_072,
              maxOutputTokens: 8192,
              providerOptions: '{ "thinking": { "type": "disabled" } }',
              manualOverrides: expect.arrayContaining([
                'supportsImageOutput',
                'supportsEmbedding',
                'contextWindow',
                'maxOutputTokens',
                'providerOptions'
              ])
            })
          ]
        })
      )
    })
  })

  it('tests the selected model from the provider test menu', async () => {
    const defaultSettings = createDefaultAppSettings()
    const existingSettings: AppSettings = {
      ...defaultSettings,
      providers: {
        ...defaultSettings.providers,
        moonshot: {
          ...defaultSettings.providers.moonshot,
          provider: 'moonshot',
          hasApiKey: true,
          apiKey: 'sk-moonshot-demo',
          model: '',
          models: [
            {
              id: 'moonshot-v1-32k',
              name: 'moonshot-v1-32k',
              enabled: true,
              isManual: false
            },
            {
              id: 'kimi-k2.5',
              name: 'kimi-k2.5',
              enabled: true,
              isManual: false
            }
          ],
          availableModels: [
            {
              id: 'moonshot-v1-32k',
              name: 'moonshot-v1-32k',
              enabled: true,
              isManual: false
            },
            {
              id: 'kimi-k2.5',
              name: 'kimi-k2.5',
              enabled: true,
              isManual: false
            }
          ],
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

    await user.click(getProviderCatalogItem('Moonshot'))
    await user.click(screen.getByRole('button', { name: '选择要测试的模型' }))
    await user.type(screen.getByLabelText('搜索要测试的模型'), 'k2.5')
    await user.click(screen.getByRole('button', { name: 'kimi-k2.5' }))

    await waitFor(() => {
      expect(api.settings.testProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'moonshot',
          selectedModel: 'kimi-k2.5'
        })
      )
    })
    expect(await screen.findByText(/连接成功！ \(\d+ms\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '连接成功，选择模型重新测试' })).toBeInTheDocument()
  })

  it('formats million-token context windows in the model list', () => {
    const defaultSettings = createDefaultAppSettings()
    const existingSettings: AppSettings = {
      ...defaultSettings,
      providers: {
        ...defaultSettings.providers,
        openai: {
          ...defaultSettings.providers.openai,
          provider: 'openai',
          hasApiKey: true,
          apiKey: 'sk-openai-demo',
          model: 'million-token-model',
          models: [
            {
              id: 'million-token-model',
              name: 'million-token-model',
              enabled: true,
              isManual: true,
              contextWindow: 1_000_000
            }
          ],
          availableModels: [
            {
              id: 'million-token-model',
              name: 'million-token-model',
              enabled: true,
              isManual: true,
              contextWindow: 1_000_000
            }
          ],
          baseUrl: '',
          updatedAt: '2026-04-21T00:00:00.000Z'
        }
      }
    }

    api = installMockWindowApi({
      appSettings: existingSettings,
      savedSettings: existingSettings
    })

    renderWithProviders(<SettingsPage />, {
      preloadedSettings: {
        activeSection: 'providers',
        appSettings: existingSettings,
        loadStatus: 'succeeded'
      }
    })

    expect(screen.getByText('1M')).toBeInTheDocument()
    expect(screen.getByLabelText('1,000,000 token context window')).toBeInTheDocument()
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

  it('shows a toast when provider model fetch fails', async () => {
    api.settings.fetchProviderModels.mockRejectedValue(new Error('API key is required.'))

    const { user } = renderWithProviders(
      <>
        <SettingsPage />
        <Toaster />
      </>,
      {
        preloadedSettings: {
          activeSection: 'providers'
        }
      }
    )

    fireEvent.change(screen.getByLabelText('OpenAI API Key'), {
      target: { value: 'sk-openai-demo' }
    })
    await user.click(screen.getByRole('button', { name: 'Fetch' }))

    expect(await screen.findByText('获取模型失败')).toBeInTheDocument()
    expect(screen.getByText('API key is required.')).toBeInTheDocument()
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
