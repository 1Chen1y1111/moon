/**
 * 负责判断聊天 provider 的可用性并解析聊天模型选择。
 * 它只处理纯配置规则，不创建 SDK client、不访问密钥或持久化状态。
 */

import type { ProviderModel } from './provider'
import type { AppSettings, ProviderSettings } from './settings'

/**
 * 判断 provider 是否走 OpenAI-compatible HTTP 协议。
 */
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

/**
 * 判断 provider 模型目录里是否包含当前可由 Claude SDK 执行的 Anthropic Messages 协议。
 */
function hasAnthropicMessagesModel(provider: ProviderSettings): boolean {
  return getChatProviderModelCandidates(provider).some(
    (model) => model.providerApi === 'anthropic-messages'
  )
}

/**
 * 判断当前 provider 是否能进入 Moon agent backend 可执行发送路径。
 */
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
    provider.type === 'anthropic' ||
    provider.apiFormat === 'anthropic' ||
    hasAnthropicMessagesModel(provider)
  )
}

/**
 * 判断 provider 是否允许出现在首页模型选择器中。
 */
export function isSelectableChatProvider(provider: ProviderSettings): boolean {
  if (
    provider.isACP ||
    provider.isOAuth ||
    provider.kind === 'coding-plan' ||
    provider.type === 'azure'
  ) {
    return false
  }

  return (
    isSupportedChatProvider(provider) ||
    isOpenAICompatibleProvider(provider) ||
    getChatProviderModelCandidates(provider).length > 0
  )
}

/**
 * 从设置中选择第一个启用且可执行聊天的 provider。
 */
export function selectDefaultChatProvider(settings: AppSettings): ProviderSettings {
  const provider = Object.values(settings.providers).find(
    (candidate) => candidate.enabled && isSupportedChatProvider(candidate)
  )

  if (provider === undefined) {
    throw new Error('No enabled chat provider configured.')
  }

  return provider
}

/**
 * 从设置中选择第一个已启用且可在首页选择模型的 provider。
 */
export function selectDefaultSelectableChatProvider(settings: AppSettings): ProviderSettings {
  const provider = Object.values(settings.providers).find(
    (candidate) => candidate.enabled && isSelectableChatProvider(candidate)
  )

  if (provider === undefined) {
    throw new Error('No selectable chat provider configured.')
  }

  return provider
}

/**
 * 返回模型候选列表，优先使用远端刷新到的模型。
 */
export function getChatProviderModelCandidates(provider: ProviderSettings): ProviderModel[] {
  return provider.availableModels.length > 0 ? provider.availableModels : provider.models
}

/**
 * 返回首页模型选择器可展示的模型，允许用户直接选择并启用可用模型。
 */
export function getSelectableChatProviderModels(provider: ProviderSettings): ProviderModel[] {
  return getChatProviderModelCandidates(provider)
}

/**
 * 返回可在聊天中选择的模型列表，并保留当前已选模型。
 */
export function getEnabledChatProviderModels(provider: ProviderSettings): ProviderModel[] {
  const selectedModelId = selectChatModelId(provider)

  return getChatProviderModelCandidates(provider).filter(
    (model) => model.enabled || model.id === selectedModelId
  )
}

/**
 * 在 provider 的模型候选中查找指定模型。
 */
export function findChatProviderModel(
  provider: ProviderSettings | undefined,
  modelId: string
): ProviderModel | undefined {
  if (provider === undefined || modelId.trim().length === 0) {
    return undefined
  }

  return getChatProviderModelCandidates(provider).find((model) => model.id === modelId)
}

/**
 * 返回 provider 当前选中的模型 ID，空字符串表示未选择。
 */
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

/**
 * 返回 provider 当前选中的模型 ID，未配置时抛出可展示错误。
 */
export function selectChatModel(provider: ProviderSettings): string {
  const model = selectChatModelId(provider)

  if (model.length === 0) {
    throw new Error(`No model selected for ${provider.name}.`)
  }

  return model
}

/**
 * 返回模型选择器展示文本，优先使用模型名称。
 */
export function selectChatModelLabel(provider: ProviderSettings | undefined): string {
  const modelId = selectChatModelId(provider)

  if (modelId.length === 0) {
    return '未选择模型'
  }

  return findChatProviderModel(provider, modelId)?.name.trim() || modelId
}
