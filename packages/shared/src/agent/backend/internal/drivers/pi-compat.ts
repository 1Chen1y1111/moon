/**
 * 负责 Pi-compatible 自定义端点的 agent backend driver。
 * 它根据 customEndpoint.api 在 Anthropic Messages 与 OpenAI Chat Completions agent 间路由。
 */

import { CompatAnthropicMessagesAgent } from '../../../compat-anthropic-messages-agent'
import { CompatOpenAiCompletionsAgent } from '../../../compat-openai-completions-agent'
import { PiAgent } from '../../../pi-agent'
import type { AgentBackendDriver } from '../driver-types'

const unsupportedCompatEndpointMessage =
  'Unsupported compatible endpoint protocol. Choose OpenAI Chat Completions or Anthropic Messages.'

export const piCompatDriver: AgentBackendDriver = {
  provider: 'pi_compat',

  /**
   * 根据自定义端点协议创建兼容 agent；未知协议返回清晰错误占位。
   */
  createAgent(config) {
    if (config.customEndpoint?.api === 'anthropic-messages') {
      return new CompatAnthropicMessagesAgent({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        messages: config.messages ?? [],
        model: config.model
      })
    }

    if (config.customEndpoint?.api === 'openai-completions') {
      return new CompatOpenAiCompletionsAgent({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        messages: config.messages ?? [],
        model: config.model
      })
    }

    return new PiAgent({
      model: config.model,
      notWiredMessage: unsupportedCompatEndpointMessage
    })
  }
}
