import type { ProviderModel } from './provider'
import type { AppSettings, ProviderSettings } from './settings'

export function isOpenAICompatibleProvider(provider: ProviderSettings): boolean {
  return (
    provider.type === 'moonshot' ||
    provider.type === 'aihubmix' ||
    provider.type === 'deepseek' ||
    provider.type === 'openrouter' ||
    provider.type === 'volcengine' ||
    provider.type === 'ollama' ||
    provider.type === 'cloudflare-ai-gateway' ||
    provider.type === 'custom'
  )
}

export function isSupportedChatProvider(provider: ProviderSettings): boolean {
  if (
    provider.isACP ||
    provider.isOAuth ||
    provider.kind === 'coding-plan' ||
    provider.type === 'azure'
  ) {
    return false
  }

  return (
    provider.type === 'openai' ||
    provider.type === 'anthropic' ||
    provider.type === 'google' ||
    provider.apiFormat === 'anthropic' ||
    provider.apiFormat === 'openai-responses' ||
    (provider.apiFormat === 'openai-chat' && isOpenAICompatibleProvider(provider))
  )
}

export function selectDefaultChatProvider(settings: AppSettings): ProviderSettings {
  const provider = Object.values(settings.providers).find(
    (candidate) => candidate.enabled && isSupportedChatProvider(candidate)
  )

  if (provider === undefined) {
    throw new Error('No enabled chat provider configured.')
  }

  return provider
}

export function getChatProviderModelCandidates(provider: ProviderSettings): ProviderModel[] {
  return provider.availableModels.length > 0 ? provider.availableModels : provider.models
}

export function getEnabledChatProviderModels(provider: ProviderSettings): ProviderModel[] {
  const selectedModelId = selectChatModelId(provider)

  return getChatProviderModelCandidates(provider).filter(
    (model) => model.enabled || model.id === selectedModelId
  )
}

export function findChatProviderModel(
  provider: ProviderSettings | undefined,
  modelId: string
): ProviderModel | undefined {
  if (provider === undefined || modelId.trim().length === 0) {
    return undefined
  }

  return getChatProviderModelCandidates(provider).find((model) => model.id === modelId)
}

export function selectChatModelId(provider: ProviderSettings | undefined): string {
  if (provider === undefined) {
    return ''
  }

  return (
    provider.model.trim() ||
    provider.models.find((candidate) => candidate.enabled)?.id.trim() ||
    provider.availableModels.find((candidate) => candidate.enabled)?.id.trim() ||
    ''
  )
}

export function selectChatModel(provider: ProviderSettings): string {
  const model = selectChatModelId(provider)

  if (model.length === 0) {
    throw new Error(`No model selected for ${provider.name}.`)
  }

  return model
}

export function selectChatModelLabel(provider: ProviderSettings | undefined): string {
  const modelId = selectChatModelId(provider)

  if (modelId.length === 0) {
    return '未选择模型'
  }

  return findChatProviderModel(provider, modelId)?.name.trim() || modelId
}
