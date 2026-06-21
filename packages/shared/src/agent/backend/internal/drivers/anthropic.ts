/**
 * 负责 Anthropic 官方 provider 的 agent backend driver。
 * 它只把统一 backend config 映射到 ClaudeAgent，不处理 provider settings 或持久化。
 */

import { ClaudeAgent } from '../../../claude-agent'
import type { AgentBackendDriver } from '../driver-types'

export const anthropicDriver: AgentBackendDriver = {
  provider: 'anthropic',

  /**
   * 创建 Claude Agent SDK backed agent 实例。
   */
  createAgent(config) {
    return new ClaudeAgent({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      messages: config.messages ?? [],
      model: config.model,
      permissionMode: config.permissionMode,
      sources: config.sources,
      thinkingLevel: config.thinkingLevel,
      workspace: config.workspace
    })
  }
}
