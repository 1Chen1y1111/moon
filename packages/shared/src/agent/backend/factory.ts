/**
 * 负责提供 agent backend 的创建入口和 provider 可用性查询。
 * 它只根据 backend config 选择实现，不处理 provider settings、IPC 或持久化状态。
 */

import { agentBackendProviders } from '../../config'
import { ClaudeAgent } from '../claude-agent'
import { anthropicDriver } from './internal/drivers/anthropic'
import { piCompatDriver } from './internal/drivers/pi-compat'
import { piDriver } from './internal/drivers/pi'
import type { ProviderDriver } from './internal/driver-types'
import {
  resolveAgentBackendRuntimeContext,
  type AgentBackendRuntimeContext
} from './internal/runtime-resolver'
import type { AgentBackend, AgentBackendConfig } from './types'

const DRIVER_REGISTRY: Record<AgentBackendConfig['provider'], ProviderDriver> = {
  anthropic: anthropicDriver,
  pi: piDriver,
  pi_compat: piCompatDriver
}

/**
 * 返回指定 provider 的 backend driver，缺失时抛出配置错误。
 */
function getProviderDriver(provider: AgentBackendConfig['provider']): ProviderDriver {
  const driver = DRIVER_REGISTRY[provider]

  if (driver === undefined) {
    throw new Error(`No agent backend driver registered for provider: ${String(provider)}`)
  }

  return driver
}

/**
 * 根据已解析 runtime context 创建具体 backend，保证 provider 创建主入口收口在 factory。
 */
function createBackendFromRuntimeContext(context: AgentBackendRuntimeContext): AgentBackend {
  if (context.provider === 'anthropic') {
    return new ClaudeAgent({
      agentSessionState: context.agentSessionState,
      apiKey: context.apiKey,
      baseUrl: context.baseUrl,
      messages: context.messages,
      model: context.model,
      permissionMode: context.permissionMode,
      sources: context.sources,
      thinkingLevel: context.thinkingLevel,
      workspace: context.workspace
    })
  }

  throw new Error(`No resolved agent backend factory for provider: ${String(context.provider)}`)
}

/**
 * 返回当前架构规划中支持的 backend provider 列表，用于设置页和测试固定选项。
 */
export function getAvailableAgentProviders(): AgentBackendConfig['provider'][] {
  return [...agentBackendProviders]
}

/**
 * 根据 provider 创建具体 backend，调用方负责提前完成配置校验和密钥解析。
 */
export function createBackend(config: AgentBackendConfig): AgentBackend {
  const driver = getProviderDriver(config.provider)
  const context = resolveAgentBackendRuntimeContext({
    config,
    providerRuntime: driver.resolve(config)
  })

  return createBackendFromRuntimeContext(context)
}

/**
 * 保留 agent 创建别名，旧调用方可以继续使用；新代码优先使用 createBackend。
 */
export const createAgent = createBackend
