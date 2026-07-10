/**
 * 负责把 LLM connection 配置转换成 agent backend 可消费的配置。
 * 它只处理连接配置到 backend config 的字段映射，不创建 SDK client 或访问持久化。
 */

import type { NormalizedLlmConnection } from '../config'
import type {
  AgentBackendConfig,
  AgentBackendMessage,
  AgentProviderSessionFork,
  AgentBackendWorkspace
} from './backend/types'
import type { AgentSessionRuntimeState } from './core/session-runtime-state'
import type { AgentSourceRecord } from './core/source-manager'
import type { AgentPermissionMode } from './core/types'

export const piBackendNotWiredMessage =
  'Pi backend is not wired yet. Configure an Anthropic-compatible connection for now.'

/**
 * 描述从 LLM connection 组装 agent backend config 所需的显式运行时输入。
 */
export type CreateConnectionAgentBackendConfigInput = {
  agentSessionState?: AgentSessionRuntimeState
  connection: NormalizedLlmConnection
  messages: AgentBackendMessage[]
  permissionMode?: AgentPermissionMode
  providerSessionFork?: AgentProviderSessionFork
  sources?: AgentSourceRecord[]
  workspace?: AgentBackendWorkspace
}

/**
 * 解析 connection 实际应使用的 agent backend；不再把 Pi-compatible 连接改写成 Claude 路径。
 */
export function resolveConnectionAgentBackendProvider(
  connection: NormalizedLlmConnection
): AgentBackendConfig['provider'] {
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

  if (provider === 'pi' || provider === 'pi_compat') {
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
export function createConnectionAgentBackendConfig({
  agentSessionState,
  connection,
  messages,
  permissionMode,
  providerSessionFork,
  sources,
  workspace
}: CreateConnectionAgentBackendConfigInput): AgentBackendConfig {
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
    ...(agentSessionState === undefined ? {} : { agentSessionState }),
    ...(permissionMode === undefined ? {} : { permissionMode }),
    ...(providerSessionFork === undefined ? {} : { providerSessionFork }),
    ...(sources === undefined ? {} : { sources }),
    ...(workspace === undefined ? {} : { workspace })
  }
}
