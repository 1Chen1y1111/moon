/**
 * 负责把 provider settings 转换成 agent backend 可消费的配置。
 * 它只处理纯配置校验和字段映射，不创建 SDK client、不访问持久化或 Electron API。
 */

import {
  customEndpointApis,
  llmConnectionSchema,
  type AgentBackendProvider,
  type CustomEndpointApi,
  type NormalizedLlmConnection
} from '../config'
import { resolveProviderEffectiveBaseUrl } from '../domain/provider'
import { isOpenAICompatibleProvider } from '../domain/chat-provider'
import type { ProviderSettings } from '../domain/settings'
import type { AgentBackendConfig, AgentBackendMessage } from './backend/types'
import { createConnectionAgentBackendConfig } from './connection-adapter'

const piBackendNotWiredMessage =
  'Pi backend is not wired yet. Configure an Anthropic provider for now.'

/**
 * 判断字符串是否是后端已支持的兼容端点协议。
 */
function isCustomEndpointApi(value: string | undefined): value is CustomEndpointApi {
  return customEndpointApis.includes(value as CustomEndpointApi)
}

/**
 * 判断 provider 是否应走 Anthropic 官方后端，而不是兼容端点后端。
 */
function isOfficialAnthropicProvider(provider: ProviderSettings): boolean {
  return provider.type === 'anthropic'
}

/**
 * 在 provider 的模型列表中查找当前选中的模型，优先使用刷新后的 availableModels。
 */
function findProviderModel(provider: ProviderSettings, modelId: string) {
  return [...provider.availableModels, ...provider.models].find((model) => model.id === modelId)
}

/**
 * 根据 provider API 格式选择兼容端点协议；未知格式留给 Pi 占位路径。
 */
function resolveProviderCustomEndpointApi(
  provider: ProviderSettings,
  modelId: string
): CustomEndpointApi | undefined {
  const model = findProviderModel(provider, modelId)

  if (isCustomEndpointApi(model?.providerApi)) {
    return model.providerApi
  }

  if (provider.apiFormat === 'anthropic') {
    return 'anthropic-messages'
  }

  if (provider.apiFormat === 'openai-chat' && isOpenAICompatibleProvider(provider)) {
    return 'openai-completions'
  }

  return undefined
}

/**
 * 解析 provider 最终使用的 base URL，优先使用用户保存的覆盖值。
 */
function resolveProviderBaseUrl(provider: ProviderSettings, modelId: string): string {
  const userBaseUrl = provider.baseUrl.trim()
  const modelBaseUrl = findProviderModel(provider, modelId)?.providerBaseUrl?.trim() ?? ''

  if (userBaseUrl.length > 0) {
    return userBaseUrl
  }

  if (modelBaseUrl.length > 0) {
    return modelBaseUrl
  }

  return resolveProviderEffectiveBaseUrl({
    provider: provider.provider,
    apiFormat: provider.apiFormat,
    baseUrl: provider.baseUrl,
    defaultBaseUrl: provider.defaultBaseUrl
  })
}

/**
 * 把旧 provider settings 映射成等价的 LLM connection，便于新旧配置路径共享 backend config 逻辑。
 */
export function createProviderLlmConnection(
  provider: ProviderSettings,
  modelId: string
): NormalizedLlmConnection {
  const baseUrl = resolveProviderBaseUrl(provider, modelId)
  const backend = resolveAgentBackendProvider(provider, modelId)
  const customEndpointApi =
    backend === 'pi_compat' ? resolveProviderCustomEndpointApi(provider, modelId) : undefined

  return llmConnectionSchema.parse({
    id: provider.provider,
    name: provider.name,
    providerId: provider.provider,
    backend,
    model: modelId,
    enabled: provider.enabled,
    isDefault: false,
    thinkingLevel: 'medium',
    ...(customEndpointApi === undefined ? {} : { customEndpoint: { api: customEndpointApi } }),
    ...(provider.noApiKey ? {} : { apiKey: provider.apiKey.trim() }),
    ...(baseUrl.length === 0 ? {} : { baseUrl })
  })
}

/**
 * 校验 provider 是否具备当前 backend 启动所需的最小凭据。
 */
export function assertProviderCredentials(provider: ProviderSettings): void {
  const apiKey = provider.apiKey.trim()

  if (!provider.noApiKey && apiKey.length === 0) {
    throw new Error(`${provider.name} API key is required.`)
  }
}

/**
 * 根据 provider 协议配置决定后续应路由到哪个 agent backend。
 */
export function resolveAgentBackendProvider(
  provider: ProviderSettings,
  modelId = provider.model
): AgentBackendProvider {
  if (isOfficialAnthropicProvider(provider)) {
    return 'anthropic'
  }

  return resolveProviderCustomEndpointApi(provider, modelId) === undefined ? 'pi' : 'pi_compat'
}

/**
 * 在保存会话数据前确认 provider 当前可执行，避免半写入后才发现 backend 缺失。
 */
export function assertProviderReadyForAgent(
  provider: ProviderSettings,
  modelId = provider.model
): void {
  assertProviderCredentials(provider)

  if (resolveAgentBackendProvider(provider, modelId) === 'pi') {
    throw new Error(piBackendNotWiredMessage)
  }
}

/**
 * 把 provider settings 转换成 backend factory 可以消费的配置。
 */
export function createProviderAgentBackendConfig(
  provider: ProviderSettings,
  modelId: string,
  messages: AgentBackendMessage[]
): AgentBackendConfig {
  return createConnectionAgentBackendConfig(
    createProviderLlmConnection(provider, modelId),
    messages
  )
}
