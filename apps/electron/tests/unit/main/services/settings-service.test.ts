// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsService } from '@main/services/settings-service'
import { llmConnectionSchema } from '@moon/shared/config'
import {
  createDefaultAppSettings,
  createDefaultProviderSettings,
  type AppSettings,
  type ProviderSettings
} from '@moon/shared/domain/settings'
import type { ProviderModel } from '@moon/shared/domain/provider'
import type { ProviderConnectionInput } from '@moon/shared/domain/settings-validation'

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload))
  } as unknown as Response
}

function createFetchProviderModelsInput(
  input: Partial<ProviderConnectionInput> & Pick<ProviderConnectionInput, 'provider'>
): ProviderConnectionInput {
  return {
    apiKey: 'sk-demo',
    model: '',
    models: [],
    availableModels: [],
    baseUrl: 'https://api.example.com/v1',
    customHeaders: '',
    acpArgs: [],
    ...input
  }
}

function createSettingsRepositoryMock(appSettings = createDefaultAppSettings()): {
  findLlmConnectionById: ReturnType<typeof vi.fn>
  getSettings: ReturnType<typeof vi.fn>
  getProviderApiKey: ReturnType<typeof vi.fn>
  saveAppearance: ReturnType<typeof vi.fn>
  saveLlmConnection: ReturnType<typeof vi.fn>
  saveProvider: ReturnType<typeof vi.fn>
  updateProviderModels: ReturnType<typeof vi.fn>
} {
  return {
    findLlmConnectionById: vi.fn().mockResolvedValue(null),
    getSettings: vi.fn().mockResolvedValue(appSettings),
    getProviderApiKey: vi.fn().mockResolvedValue(''),
    saveAppearance: vi.fn().mockResolvedValue(appSettings),
    saveLlmConnection: vi.fn().mockImplementation(async (connection) => connection),
    saveProvider: vi.fn().mockResolvedValue(appSettings),
    updateProviderModels: vi.fn().mockResolvedValue(appSettings)
  }
}

/**
 * 创建只覆盖单个 provider 的设置 fixture，便于验证服务层同步逻辑。
 */
function createSettingsWithProvider(provider: ProviderSettings): AppSettings {
  return {
    ...createDefaultAppSettings(),
    providers: {
      ...createDefaultAppSettings().providers,
      [provider.provider]: provider
    }
  }
}

describe('SettingsService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('validates and saves appearance settings', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    const settings = await service.saveAppearance({ theme: 'dark' })

    expect(settings).toEqual(createDefaultAppSettings())
    expect(settingsRepository.saveAppearance).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('redacts provider and connection secrets from public settings responses', async () => {
    const appSettings = createDefaultAppSettings()
    appSettings.providers.openai = {
      ...appSettings.providers.openai,
      hasApiKey: true,
      apiKey: 'sk-openai-demo'
    }
    appSettings.llmConnections = [
      llmConnectionSchema.parse({
        id: 'openai',
        name: 'OpenAI',
        providerId: 'openai',
        backend: 'pi_compat',
        model: 'gpt-5.4',
        apiKey: 'sk-openai-demo',
        baseUrl: 'https://api.openai.com/v1',
        customEndpoint: { api: 'openai-completions' },
        enabled: true,
        isDefault: true,
        thinkingLevel: 'medium'
      })
    ]
    const settingsRepository = createSettingsRepositoryMock(appSettings)
    const service = new SettingsService(settingsRepository as never)

    const settings = await service.getSettings()

    expect(settings.providers.openai).toMatchObject({
      hasApiKey: true,
      apiKey: ''
    })
    expect(settings.llmConnections[0]).not.toHaveProperty('apiKey')
  })

  it('rejects unsupported appearance themes before writing to the repository', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    await expect(service.saveAppearance({ theme: 'blue' } as never)).rejects.toThrow()
    expect(settingsRepository.saveAppearance).not.toHaveBeenCalled()
  })

  it('normalizes provider drafts before writing to the repository', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    const settings = await service.saveProvider({
      provider: 'openai',
      apiKey: ' sk-openai-demo ',
      model: ' gpt-5.4 ',
      baseUrl: 'https://ignored.example.com'
    })

    expect(settings).toEqual(createDefaultAppSettings())
    expect(settingsRepository.saveProvider).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-openai-demo',
        model: 'gpt-5.4',
        baseUrl: 'https://ignored.example.com',
        apiFormat: 'openai-chat',
        useMaxCompletionTokens: true
      })
    )
  })

  it('does not sync OpenAI-compatible providers into enabled Pi-compatible connections', async () => {
    const deepseekModel: ProviderModel = {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      enabled: true,
      isManual: false,
      providerApi: 'openai-completions',
      providerBaseUrl: 'https://api.deepseek.com'
    }
    const appSettings = createSettingsWithProvider({
      ...createDefaultProviderSettings('deepseek'),
      enabled: true,
      hasApiKey: true,
      apiKey: 'sk-deepseek-demo',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel]
    })
    const settingsRepository = createSettingsRepositoryMock(appSettings)
    const service = new SettingsService(settingsRepository as never)

    await service.saveProvider({
      provider: 'deepseek',
      apiKey: 'sk-deepseek-demo',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel],
      enabled: true
    })

    expect(settingsRepository.saveLlmConnection).not.toHaveBeenCalled()
  })

  it('syncs DeepSeek Anthropic protocol into a Claude SDK LLM connection', async () => {
    const deepseekModel: ProviderModel = {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      enabled: true,
      isManual: false,
      providerApi: 'openai-completions',
      providerBaseUrl: 'https://api.deepseek.com'
    }
    const appSettings = createSettingsWithProvider({
      ...createDefaultProviderSettings('deepseek'),
      apiFormat: 'anthropic',
      enabled: true,
      hasApiKey: true,
      apiKey: 'sk-deepseek-demo',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel]
    })
    const settingsRepository = createSettingsRepositoryMock(appSettings)
    const service = new SettingsService(settingsRepository as never)

    await service.saveProvider({
      provider: 'deepseek',
      apiKey: 'sk-deepseek-demo',
      apiFormat: 'anthropic',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel],
      enabled: true
    })

    expect(settingsRepository.saveLlmConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deepseek',
        providerId: 'deepseek',
        backend: 'anthropic',
        model: 'deepseek-v4-flash',
        apiKey: 'sk-deepseek-demo',
        baseUrl: 'https://api.deepseek.com/anthropic',
        enabled: true,
        isDefault: false
      })
    )
    expect(settingsRepository.saveLlmConnection.mock.calls[0]?.[0]).not.toHaveProperty(
      'customEndpoint'
    )
  })

  it('disables the synchronized LLM connection when the provider is no longer runnable', async () => {
    const appSettings = createSettingsWithProvider({
      ...createDefaultProviderSettings('deepseek'),
      enabled: false
    })
    const existingConnection = llmConnectionSchema.parse({
      id: 'deepseek',
      name: 'DeepSeek',
      providerId: 'deepseek',
      backend: 'pi_compat',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-deepseek-demo',
      baseUrl: 'https://api.deepseek.com',
      customEndpoint: { api: 'openai-completions' },
      enabled: true,
      isDefault: true,
      thinkingLevel: 'medium'
    })
    const settingsRepository = createSettingsRepositoryMock(appSettings)
    settingsRepository.findLlmConnectionById.mockResolvedValue(existingConnection)
    const service = new SettingsService(settingsRepository as never)

    await service.saveProvider({
      provider: 'deepseek',
      enabled: false
    })

    expect(settingsRepository.saveLlmConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deepseek',
        enabled: false,
        isDefault: false
      })
    )
  })

  it('disables existing Pi-compatible provider connections when the provider remains selectable only', async () => {
    const deepseekModel: ProviderModel = {
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      enabled: true,
      isManual: false,
      providerApi: 'openai-completions',
      providerBaseUrl: 'https://api.deepseek.com'
    }
    const appSettings = createSettingsWithProvider({
      ...createDefaultProviderSettings('deepseek'),
      enabled: true,
      hasApiKey: true,
      apiKey: 'sk-deepseek-demo',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel]
    })
    const existingConnection = llmConnectionSchema.parse({
      id: 'deepseek',
      name: 'DeepSeek',
      providerId: 'deepseek',
      backend: 'pi_compat',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-deepseek-demo',
      baseUrl: 'https://api.deepseek.com',
      customEndpoint: { api: 'openai-completions' },
      enabled: true,
      isDefault: true,
      thinkingLevel: 'medium'
    })
    const settingsRepository = createSettingsRepositoryMock(appSettings)
    settingsRepository.findLlmConnectionById.mockResolvedValue(existingConnection)
    const service = new SettingsService(settingsRepository as never)

    await service.saveProvider({
      provider: 'deepseek',
      apiKey: 'sk-deepseek-demo',
      model: deepseekModel.id,
      models: [deepseekModel],
      availableModels: [deepseekModel],
      enabled: true
    })

    expect(settingsRepository.saveLlmConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deepseek',
        enabled: false,
        isDefault: false
      })
    )
  })

  it('requires a valid HTTP base url for providers that require a base url', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    await expect(
      service.saveProvider({
        provider: 'openai-compatible',
        apiKey: 'sk-compatible-demo',
        model: 'gpt-compatible',
        baseUrl: '',
        enabled: true
      })
    ).rejects.toThrow(/Base URL is required/)
    await expect(
      service.saveProvider({
        provider: 'openai-compatible',
        apiKey: 'sk-compatible-demo',
        model: 'gpt-compatible',
        baseUrl: 'ftp://api.example.com'
      })
    ).rejects.toThrow(/Base URL must be a valid HTTP URL/)
    expect(settingsRepository.saveProvider).not.toHaveBeenCalled()
  })

  it('rejects API keys that cannot be used as HTTP header values', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    await expect(
      service.saveProvider({
        provider: 'deepseek',
        apiKey: '没有可选模型  先启用一个聊天 Provider 和模型。',
        enabled: true
      })
    ).rejects.toThrow('API key must not contain spaces or non-ASCII characters.')
    expect(settingsRepository.saveProvider).not.toHaveBeenCalled()
  })

  it('rejects invalid optional provider base urls before writing to the repository', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    await expect(
      service.saveProvider({
        provider: 'openai',
        apiKey: 'sk-openai-demo',
        model: 'gpt-5.4',
        baseUrl: 'ftp://api.example.com'
      })
    ).rejects.toThrow(/Base URL must be a valid HTTP URL/)
    expect(settingsRepository.saveProvider).not.toHaveBeenCalled()
  })

  it('keeps the compatible provider base url when validation passes', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    await service.saveProvider({
      provider: 'openai-compatible',
      apiKey: ' sk-compatible-demo ',
      model: ' gpt-compatible ',
      baseUrl: ' https://api.example.com/v1 '
    })

    expect(settingsRepository.saveProvider).toHaveBeenCalledWith(
      'openai-compatible',
      expect.objectContaining({
        provider: 'openai-compatible',
        apiKey: 'sk-compatible-demo',
        model: 'gpt-compatible',
        baseUrl: 'https://api.example.com/v1'
      })
    )
  })

  it('uses the DeepSeek provider model catalog and enriches it with exact models.dev metadata', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        deepseek: {
          models: {
            'deepseek-v4-flash': {
              name: 'DeepSeek V4 Flash',
              modalities: { input: ['text', 'image'], output: ['text'] },
              tool_call: true,
              reasoning: false,
              limit: { context: 131_072, output: 8192 }
            },
            'deepseek-v4-pro': {
              name: 'DeepSeek V4 Pro',
              modalities: { input: ['text'], output: ['text', 'image'] },
              tool_call: true,
              reasoning: true,
              limit: { context: 262_144, output: 16_384 }
            },
            'deepseek-extra': {
              name: 'DeepSeek Extra',
              tool_call: true
            }
          }
        }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await service.fetchProviderModels(
      createFetchProviderModelsInput({ provider: 'deepseek', baseUrl: '' })
    )

    const [, models, availableModels] = settingsRepository.updateProviderModels.mock.calls[0] as [
      string,
      unknown[],
      unknown[]
    ]

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://models.dev/api.json', expect.any(Object))
    expect(models).toHaveLength(2)
    expect(availableModels).toHaveLength(2)
    expect(models).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        enabled: true,
        name: 'DeepSeek V4 Flash',
        supportsVision: true,
        supportsImageOutput: false,
        supportsToolCalling: true,
        supportsReasoning: false,
        contextWindow: 131_072,
        maxOutputTokens: 8192,
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com'
      }),
      expect.objectContaining({
        id: 'deepseek-v4-pro',
        enabled: false,
        name: 'DeepSeek V4 Pro',
        supportsVision: false,
        supportsImageOutput: true,
        supportsToolCalling: true,
        supportsReasoning: true,
        contextWindow: 262_144,
        maxOutputTokens: 16_384,
        providerApi: 'openai-completions',
        providerBaseUrl: 'https://api.deepseek.com'
      })
    ])
  })

  it('uses the OpenAI provider model catalog instead of the provider models endpoint', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi.fn().mockResolvedValueOnce(createJsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await service.fetchProviderModels(createFetchProviderModelsInput({ provider: 'openai' }))

    const [, models] = settingsRepository.updateProviderModels.mock.calls[0] as [
      string,
      ProviderConnectionInput['models']
    ]

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://models.dev/api.json', expect.any(Object))
    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gpt-5',
          providerApi: expect.stringMatching(/^openai-/u),
          providerBaseUrl: 'https://api.openai.com/v1'
        })
      ])
    )
    expect(models.some((model) => model.id.startsWith('gpt-4'))).toBe(false)
  })

  it.each([
    {
      provider: 'claude',
      modelsDevProvider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      modelName: 'Claude Sonnet 4.5'
    },
    {
      provider: 'gemini',
      modelsDevProvider: 'google',
      modelId: 'gemini-2.5-pro',
      modelName: 'Gemini 2.5 Pro'
    },
    {
      provider: 'moonshot',
      modelsDevProvider: 'moonshotai',
      modelId: 'kimi-k2.5',
      modelName: 'Kimi K2.5'
    }
  ])(
    'uses $modelsDevProvider as the models.dev provider key for $provider',
    async ({ provider, modelsDevProvider, modelId, modelName }) => {
      const settingsRepository = createSettingsRepositoryMock()
      const service = new SettingsService(settingsRepository as never)
      const fetchMock = vi.fn().mockResolvedValueOnce(
        createJsonResponse({
          [provider]: {
            models: {
              [modelId]: {
                name: 'Wrong Provider Model',
                tool_call: false
              }
            }
          },
          [modelsDevProvider]: {
            models: {
              [modelId]: {
                name: modelName,
                modalities: { input: ['text', 'image'], output: ['text'] },
                tool_call: true,
                reasoning: true,
                limit: { context: 200_000, output: 8192 }
              }
            }
          }
        })
      )
      vi.stubGlobal('fetch', fetchMock)

      await service.fetchProviderModels(createFetchProviderModelsInput({ provider }))

      const [, models] = settingsRepository.updateProviderModels.mock.calls[0] as [
        string,
        unknown[]
      ]

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('https://models.dev/api.json', expect.any(Object))
      expect(models).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: modelId,
            name: modelName,
            supportsVision: true,
            supportsToolCalling: true,
            supportsReasoning: true,
            contextWindow: 200_000,
            maxOutputTokens: 8192
          })
        ])
      )
    }
  )

  it('keeps manual model overrides after models.dev enrichment', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse({
        deepseek: {
          models: {
            'deepseek-v4-flash': {
              name: 'DeepSeek V4 Flash',
              modalities: { input: ['text', 'image'], output: ['text'] },
              tool_call: true,
              reasoning: true,
              limit: { context: 131_072, output: 8192 }
            }
          }
        }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await service.fetchProviderModels(
      createFetchProviderModelsInput({
        provider: 'deepseek',
        baseUrl: '',
        models: [
          {
            id: 'deepseek-v4-flash',
            name: 'deepseek-v4-flash',
            enabled: true,
            isManual: false,
            supportsReasoning: false,
            contextWindow: 42_000,
            manualOverrides: ['supportsReasoning', 'contextWindow']
          }
        ]
      })
    )

    const [, models] = settingsRepository.updateProviderModels.mock.calls[0] as [string, unknown[]]

    expect(models).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        enabled: true,
        name: 'DeepSeek V4 Flash',
        supportsVision: true,
        supportsToolCalling: true,
        supportsReasoning: false,
        contextWindow: 42_000,
        maxOutputTokens: 8192,
        manualOverrides: ['supportsReasoning', 'contextWindow']
      }),
      expect.objectContaining({
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        providerApi: 'openai-completions'
      })
    ])
  })

  it('rejects DeepSeek OpenAI-compatible tests before direct HTTP execution', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await service.testProvider(
      createFetchProviderModelsInput({
        provider: 'deepseek',
        apiKey: 'sk-deepseek-demo',
        baseUrl: '',
        model: 'deepseek-v4-flash'
      })
    )

    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining('Pi backend is not wired yet')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects official OpenAI tests while Pi backend is not wired', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await service.testProvider(
      createFetchProviderModelsInput({
        provider: 'openai',
        apiKey: 'sk-openai-demo',
        baseUrl: '',
        model: 'gpt-5.4'
      })
    )

    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining('Pi backend is not wired yet')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tests DeepSeek Anthropic protocol through the executable Claude SDK path', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ content: [{ text: 'ok' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await service.testProvider(
      createFetchProviderModelsInput({
        provider: 'deepseek',
        apiKey: 'sk-deepseek-demo',
        apiFormat: 'anthropic',
        baseUrl: '',
        model: 'deepseek-v4-flash'
      })
    )

    expect(result).toMatchObject({
      success: true,
      modelId: 'deepseek-v4-flash'
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/messages',
      expect.objectContaining({
        method: 'POST'
      })
    )
  })

  it('keeps official models when models.dev has no exact provider match', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [{ id: 'compatible-model', context_window: 32_000 }]
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          deepseek: {
            models: {
              'compatible-model': {
                name: 'Wrong Provider Model',
                tool_call: true,
                limit: { context: 262_144, output: 8192 }
              }
            }
          }
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await service.fetchProviderModels(
      createFetchProviderModelsInput({
        provider: 'openai-compatible',
        baseUrl: 'https://compatible.example.com/v1'
      })
    )

    const [, models] = settingsRepository.updateProviderModels.mock.calls[0] as [string, unknown[]]

    expect(models).toEqual([
      expect.objectContaining({
        id: 'compatible-model',
        name: 'compatible-model',
        contextWindow: 32_000
      })
    ])
    expect(models[0]).not.toMatchObject({
      name: 'Wrong Provider Model',
      supportsToolCalling: true,
      maxOutputTokens: 8192
    })
  })

  it('keeps official models when models.dev cannot enrich them', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [{ id: 'compatible-model', context_window: 32_000 }]
        })
      )
      .mockRejectedValueOnce(new Error('models.dev unavailable'))
    vi.stubGlobal('fetch', fetchMock)

    await service.fetchProviderModels(
      createFetchProviderModelsInput({
        provider: 'openai-compatible',
        baseUrl: 'https://compatible.example.com/v1'
      })
    )

    const [, models] = settingsRepository.updateProviderModels.mock.calls[0] as [string, unknown[]]

    expect(models).toEqual([
      expect.objectContaining({
        id: 'compatible-model',
        name: 'compatible-model',
        contextWindow: 32_000
      })
    ])
  })
})
