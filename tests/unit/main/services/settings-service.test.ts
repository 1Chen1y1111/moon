// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsService } from '@main/services/settings-service'
import { createDefaultAppSettings } from '@shared/domain/settings'
import type { ProviderConnectionInput } from '@shared/domain/settings-validation'

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
  getSettings: ReturnType<typeof vi.fn>
  getProviderApiKey: ReturnType<typeof vi.fn>
  saveAppearance: ReturnType<typeof vi.fn>
  saveProvider: ReturnType<typeof vi.fn>
  updateProviderModels: ReturnType<typeof vi.fn>
} {
  return {
    getSettings: vi.fn().mockResolvedValue(appSettings),
    getProviderApiKey: vi.fn().mockResolvedValue(''),
    saveAppearance: vi.fn().mockResolvedValue(appSettings),
    saveProvider: vi.fn().mockResolvedValue(appSettings),
    updateProviderModels: vi.fn().mockResolvedValue(appSettings)
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

  it('enriches fetched provider models with exact models.dev metadata', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }]
        })
      )
      .mockResolvedValueOnce(
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

    await service.fetchProviderModels(createFetchProviderModelsInput({ provider: 'deepseek' }))

    const [, models, availableModels] = settingsRepository.updateProviderModels.mock.calls[0] as [
      string,
      unknown[],
      unknown[]
    ]

    expect(models).toHaveLength(2)
    expect(availableModels).toHaveLength(2)
    expect(models).toEqual([
      expect.objectContaining({
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        supportsVision: true,
        supportsImageOutput: false,
        supportsToolCalling: true,
        supportsReasoning: false,
        contextWindow: 131_072,
        maxOutputTokens: 8192
      }),
      expect.objectContaining({
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        supportsVision: false,
        supportsImageOutput: true,
        supportsToolCalling: true,
        supportsReasoning: true,
        contextWindow: 262_144,
        maxOutputTokens: 16_384
      })
    ])
  })

  it('keeps manual model overrides after models.dev enrichment', async () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ data: [{ id: 'deepseek-v4-flash' }] }))
      .mockResolvedValueOnce(
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
      })
    ])
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
