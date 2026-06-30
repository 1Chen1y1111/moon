/**
 * 负责 Anthropic 官方 provider 的 agent backend driver。
 * 它只解析 provider 专属运行时信息，不直接创建具体 backend。
 */

import type { ProviderDriver } from '../driver-types'

export const anthropicDriver: ProviderDriver = {
  provider: 'anthropic',

  /**
   * 解析 Claude Agent SDK 所需的 provider 基础信息。
   */
  resolve(config) {
    return {
      provider: 'anthropic',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model
    }
  }
}
