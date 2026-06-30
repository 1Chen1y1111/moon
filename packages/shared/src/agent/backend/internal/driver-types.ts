/**
 * 负责定义 backend driver 的内部扩展合同。
 * driver 只封装 provider 专属创建逻辑，公开调用方仍通过 factory 获取统一 AgentBackend。
 */

import type { AgentBackendProvider } from '../../../config'
import type { AgentBackendConfig } from '../types'

export type ProviderRuntimeResolution = {
  provider: AgentBackendProvider
  model: string
  apiKey?: string
  baseUrl?: string
}

export type ProviderDriver = {
  provider: AgentBackendProvider

  /**
   * 解析 provider 专属运行时基础信息；backend 实例统一交给 factory 创建。
   */
  resolve(config: AgentBackendConfig): ProviderRuntimeResolution
}
