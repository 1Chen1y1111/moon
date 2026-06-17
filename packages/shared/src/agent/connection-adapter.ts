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
 * 解析 connection 实际应使用的 agent backend，兼容早期保存的 Anthropic Messages 连接。
 */
export function resolveConnectionAgentBackendProvider(
  connection: NormalizedLlmConnection
): AgentBackendConfig['provider'] {
  if (
    connection.backend === 'pi_compat' &&
    connection.customEndpoint?.api === 'anthropic-messages'
  ) {
    return 'anthropic'
  }

  return connection.backend
}

/**
 * 校验 LLM connection 是否具备创建 agent backend 的最小条件。
 */
export function assertLlmConnectionReadyForAgent(connection: NormalizedLlmConnection): void {
  const provider = resolveConnectionAgentBackendProvider(connection)

  if (!connection.enabled) {
    throw new Error(`${connection.name} is disabled.`)
  }

  if (provider === 'pi') {
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
  const provider = resolveConnectionAgentBackendProvider(connection)

  return {
    provider,
    model: connection.model,
    messages,
    thinkingLevel: connection.thinkingLevel,
    ...(provider !== 'pi_compat' || connection.customEndpoint === undefined
      ? {}
      : { customEndpoint: connection.customEndpoint }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(connection.baseUrl === undefined ? {} : { baseUrl: connection.baseUrl }),
    ...(workspace === undefined ? {} : { workspace })
  }
}
