/**
 * 负责把 LLM connection 配置转换成 agent backend 可消费的配置。
 * 它只处理连接配置到 backend config 的字段映射，不创建 SDK client 或访问持久化。
 */

import type { NormalizedLlmConnection } from '../config'
import type {
  AgentBackendConfig,
  AgentBackendMessage,
  AgentBackendWorkspace
} from './backend/types'

const piBackendNotWiredMessage =
  'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'

/**
 * 校验 LLM connection 是否具备创建 agent backend 的最小条件。
 */
export function assertLlmConnectionReadyForAgent(connection: NormalizedLlmConnection): void {
  if (!connection.enabled) {
    throw new Error(`${connection.name} is disabled.`)
  }

  if (connection.backend === 'pi') {
    throw new Error(piBackendNotWiredMessage)
  }

  if (connection.apiKey?.trim()) {
    return
  }

  throw new Error(`${connection.name} API key is required.`)
}

/**
 * 把已规范化的 LLM connection 转换成 backend factory 可以消费的配置。
 */
export function createConnectionAgentBackendConfig(
  connection: NormalizedLlmConnection,
  messages: AgentBackendMessage[],
  workspace?: AgentBackendWorkspace
): AgentBackendConfig {
  const apiKey = connection.apiKey?.trim()

  return {
    provider: connection.backend,
    model: connection.model,
    messages,
    thinkingLevel: connection.thinkingLevel,
    ...(connection.customEndpoint === undefined
      ? {}
      : { customEndpoint: connection.customEndpoint }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(connection.baseUrl === undefined ? {} : { baseUrl: connection.baseUrl }),
    ...(workspace === undefined ? {} : { workspace })
  }
}
