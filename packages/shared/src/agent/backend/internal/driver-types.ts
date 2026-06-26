/**
 * 负责定义 backend driver 的内部扩展合同。
 * driver 只封装 provider 专属创建逻辑，公开调用方仍通过 factory 获取统一 AgentBackend。
 */

import type { AgentBackendProvider } from '../../../config'
import type { AgentBackend, AgentBackendConfig } from '../types'

export type ProviderDriver = {
  provider: AgentBackendProvider

  /**
   * 根据统一 backend config 创建 provider 专属 agent 实例。
   */
  createBackend(config: AgentBackendConfig): AgentBackend
}
