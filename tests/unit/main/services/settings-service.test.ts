// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { SettingsService } from '@main/services/settings-service'
import { createDefaultAppSettings } from '@shared/domain/settings'

function createSettingsRepositoryMock(): {
  getSettings: ReturnType<typeof vi.fn>
  saveAppearance: ReturnType<typeof vi.fn>
  saveProvider: ReturnType<typeof vi.fn>
} {
  const appSettings = createDefaultAppSettings()

  return {
    getSettings: vi.fn().mockResolvedValue(appSettings),
    saveAppearance: vi.fn().mockResolvedValue(appSettings),
    saveProvider: vi.fn().mockResolvedValue(appSettings)
  }
}

describe('SettingsService', () => {
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
})
