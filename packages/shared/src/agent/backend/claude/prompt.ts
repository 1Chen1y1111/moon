/**
 * 负责构造 Claude SDK 单轮调用需要的 prompt 文本。
 * 它只处理共享消息上下文到纯文本 prompt 的转换，不负责模型选择或 SDK 参数。
 */

import type { AgentBackendMessage } from '../types'

/**
 * 生成给 Claude SDK 的单轮 prompt，保留会话层传入的历史上下文。
 */
export function buildClaudePrompt(
  messages: AgentBackendMessage[],
  fallbackMessage: string
): string {
  if (messages.length === 0) {
    return fallbackMessage
  }

  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n')
}
