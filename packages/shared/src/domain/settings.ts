/**
 * 负责创建应用设置和 provider 设置的默认结构。
 * 它只组合共享 provider 元数据，不读取持久化数据或运行时密钥。
 */

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

/**
 * 复制默认模型，避免调用方修改共享 provider 元数据里的模型对象。
 */
function cloneProviderModels(models: ProviderModel[]): ProviderModel[] {
  return models.map((model) => ({
    ...model,
    ...(model.manualOverrides === undefined ? {} : { manualOverrides: [...model.manualOverrides] })
  }))
}

/**
 * 返回 provider 初始可用模型；只有静态模型目录会直接进入默认设置。
 */
function createInitialProviderModels(
  metadata: (typeof providerCatalog)[number] | undefined
): ProviderModel[] {
  if (metadata?.modelDiscovery !== 'static') {
    return []
  }

  return cloneProviderModels(metadata.defaultModels)
}

/**
 * 创建单个 provider 的默认设置，供设置初始化和缺省补全使用。
 */
export function createDefaultProviderSettings(provider: ProviderId): ProviderSettings {
  const metadata = providerCatalog.find((entry) => entry.provider === provider)
  const models = createInitialProviderModels(metadata)
  const availableModels = cloneProviderModels(models)
  const selectedModel = models.find((model) => model.enabled)?.id ?? ''

  return {
    provider,
    name: metadata?.label ?? 'Custom Provider',
    type: metadata?.type ?? 'custom',
    kind: metadata?.kind ?? 'custom',
    description: metadata?.description ?? 'Custom provider',
    badge: metadata?.badge ?? (metadata === undefined ? 'Custom' : ''),
    hasApiKey: false,
    apiKey: '',
    model: selectedModel,
    models,
    availableModels,
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

/**
 * 创建完整应用设置，包含外观默认值和所有内置 provider 的默认配置。
 */
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
