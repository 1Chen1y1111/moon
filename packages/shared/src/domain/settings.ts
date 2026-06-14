import {
  providerCatalog,
  type ProviderApiFormat,
  type ProviderId,
  type ProviderKind,
  type ProviderModel,
  type ProviderType
} from './provider'

export const appearanceThemes = ['light', 'dark', 'system'] as const

export type AppearanceTheme = (typeof appearanceThemes)[number]

export type AppearanceSettings = {
  theme: AppearanceTheme
}

export type ProviderSettings = {
  provider: ProviderId
  name: string
  type: ProviderType
  kind: ProviderKind
  description: string
  badge: string
  hasApiKey: boolean
  apiKey: string
  model: string
  models: ProviderModel[]
  availableModels: ProviderModel[]
  baseUrl: string
  defaultBaseUrl: string
  apiFormat: ProviderApiFormat
  useMaxCompletionTokens: boolean
  customHeaders: string
  enabled: boolean
  requiresBaseUrl: boolean
  noApiKey: boolean
  isBuiltIn: boolean
  isCustom: boolean
  isACP: boolean
  isOAuth: boolean
  apiKeyHelpUrl: string
  modelPlaceholder: string
  acpCommand: string
  acpArgs: string[]
  acpAuthMethodId: string
  updatedAt: string
  modelsUpdatedAt: string
}

export type ProviderTestResult = {
  success: boolean
  message: string
  modelId?: string
}

export type AppSettings = {
  appearance: AppearanceSettings
  providers: Record<ProviderId, ProviderSettings>
}

export function createDefaultProviderSettings(provider: ProviderId): ProviderSettings {
  const metadata = providerCatalog.find((entry) => entry.provider === provider)

  return {
    provider,
    name: metadata?.label ?? 'Custom Provider',
    type: metadata?.type ?? 'custom',
    kind: metadata?.kind ?? 'custom',
    description: metadata?.description ?? 'Custom provider',
    badge: metadata?.badge ?? (metadata === undefined ? 'Custom' : ''),
    hasApiKey: false,
    apiKey: '',
    model: '',
    models: [],
    availableModels: [],
    baseUrl: '',
    defaultBaseUrl: metadata?.defaultBaseUrl ?? '',
    apiFormat: metadata?.defaultApiFormat ?? 'openai-chat',
    useMaxCompletionTokens: metadata?.defaultUseMaxCompletionTokens ?? false,
    customHeaders: '',
    enabled: false,
    requiresBaseUrl: metadata?.requiresBaseUrl ?? true,
    noApiKey: metadata?.noApiKey ?? false,
    isBuiltIn: metadata !== undefined,
    isCustom: metadata?.kind === 'custom' || metadata === undefined,
    isACP: metadata?.isACP ?? false,
    isOAuth: metadata?.isOAuth ?? false,
    apiKeyHelpUrl: metadata?.apiKeyHelpUrl ?? '',
    modelPlaceholder: metadata?.modelPlaceholder ?? 'model-id',
    acpCommand: metadata?.acpCommand ?? '',
    acpArgs: metadata?.acpArgs ?? [],
    acpAuthMethodId: '',
    updatedAt: '',
    modelsUpdatedAt: ''
  }
}

export function createDefaultAppSettings(): AppSettings {
  return {
    appearance: {
      theme: 'system'
    },
    providers: Object.fromEntries(
      providerCatalog.map((provider) => [
        provider.provider,
        createDefaultProviderSettings(provider.provider)
      ])
    )
  }
}
