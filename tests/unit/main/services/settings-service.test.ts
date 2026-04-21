// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createDefaultAppSettings } from '@ipc/contracts'
import { SettingsService } from '@main/services/settings-service'

function createSettingsRepositoryMock(): {
  getSettings: ReturnType<typeof vi.fn>
  saveProvider: ReturnType<typeof vi.fn>
} {
  const appSettings = createDefaultAppSettings()

  return {
    getSettings: vi.fn().mockReturnValue(appSettings),
    saveProvider: vi.fn().mockReturnValue(appSettings)
  }
}

describe('SettingsService', () => {
  it('normalizes first-party provider drafts before writing to the repository', () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    const settings = service.saveProvider({
      provider: 'openai',
      apiKey: ' sk-openai-demo ',
      model: ' gpt-5.4 ',
      baseUrl: 'https://ignored.example.com'
    })

    expect(settings).toEqual(createDefaultAppSettings())
    expect(settingsRepository.saveProvider).toHaveBeenCalledWith('openai', {
      apiKey: 'sk-openai-demo',
      model: 'gpt-5.4',
      baseUrl: ''
    })
  })

  it('requires a valid HTTP base url for the OpenAI-compatible provider', () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    expect(() =>
      service.saveProvider({
        provider: 'openai-compatible',
        apiKey: 'sk-compatible-demo',
        model: 'gpt-compatible',
        baseUrl: ''
      })
    ).toThrow(/Base URL is required/)
    expect(() =>
      service.saveProvider({
        provider: 'openai-compatible',
        apiKey: 'sk-compatible-demo',
        model: 'gpt-compatible',
        baseUrl: 'ftp://api.example.com'
      })
    ).toThrow(/Base URL must be a valid HTTP URL/)
    expect(settingsRepository.saveProvider).not.toHaveBeenCalled()
  })

  it('keeps the compatible provider base url when validation passes', () => {
    const settingsRepository = createSettingsRepositoryMock()
    const service = new SettingsService(settingsRepository as never)

    service.saveProvider({
      provider: 'openai-compatible',
      apiKey: ' sk-compatible-demo ',
      model: ' gpt-compatible ',
      baseUrl: ' https://api.example.com/v1 '
    })

    expect(settingsRepository.saveProvider).toHaveBeenCalledWith('openai-compatible', {
      apiKey: 'sk-compatible-demo',
      model: 'gpt-compatible',
      baseUrl: 'https://api.example.com/v1'
    })
  })
})
