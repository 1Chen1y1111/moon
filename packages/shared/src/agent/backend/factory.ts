/**
 * 负责提供 agent backend 的创建入口和 provider 可用性查询。
 * 它只根据 backend config 选择实现，不处理 provider settings、IPC 或持久化状态。
 */

import { agentBackendProviders } from '../../config'
import { anthropicDriver } from './internal/drivers/anthropic'
import { piCompatDriver } from './internal/drivers/pi-compat'
import { piDriver } from './internal/drivers/pi'
import type { AgentBackendDriver } from './internal/driver-types'
import type { AgentBackend, AgentBackendConfig } from './types'

const driverRegistry: Record<AgentBackendConfig['provider'], AgentBackendDriver> = {
  anthropic: anthropicDriver,
  pi: piDriver,
  pi_compat: piCompatDriver
}

/**
 * 返回指定 provider 的 backend driver，缺失时抛出配置错误。
 */
function getProviderDriver(provider: AgentBackendConfig['provider']): AgentBackendDriver {
  const driver = driverRegistry[provider]

  if (driver === undefined) {
    throw new Error(`No agent backend driver registered for provider: ${String(provider)}`)
  }

  return driver
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
export function createAgent(config: AgentBackendConfig): AgentBackend {
  return getProviderDriver(config.provider).createAgent(config)
}

/**
 * 保留 backend 创建别名，方便后续在 createBackend 与 createAgent 调用语义之间兼容。
 */
export const createBackend = createAgent
