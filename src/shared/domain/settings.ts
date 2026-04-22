import type { ProviderId } from './provider'

export const appearanceThemes = ['light', 'dark', 'system'] as const

export type AppearanceTheme = (typeof appearanceThemes)[number]

export type AppearanceSettings = {
  theme: AppearanceTheme
}

export type ProviderSettings = {
  provider: ProviderId
  hasApiKey: boolean
  apiKeyPreview: string
  model: string
  baseUrl: string
  updatedAt: string
}

export type AppSettings = {
  appearance: AppearanceSettings
  providers: Record<ProviderId, ProviderSettings>
}

function createDefaultProviderSettings(provider: ProviderId): ProviderSettings {
  return {
    provider,
    hasApiKey: false,
    apiKeyPreview: '',
    model: '',
    baseUrl: '',
    updatedAt: ''
  }
}

export function createDefaultAppSettings(): AppSettings {
  return {
    appearance: {
      theme: 'system'
    },
    providers: {
      claude: createDefaultProviderSettings('claude'),
      openai: createDefaultProviderSettings('openai'),
      gemini: createDefaultProviderSettings('gemini'),
      'openai-compatible': createDefaultProviderSettings('openai-compatible')
    }
  }
}
