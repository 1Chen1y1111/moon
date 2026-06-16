/**
 * 负责把会话消息语义转换成 agent backend 的上下文消息。
 * 它只处理角色、状态和内容规则，附件读取和本地文件访问由调用方完成。
 */

import type { MessageRecord } from '../domain/chat'
import type { AgentBackendMessage } from './backend/types'

export type AgentBackendMessageSource = Pick<MessageRecord, 'content' | 'role' | 'status'>

/**
 * 根据消息角色和状态生成 backend 上下文消息，不可注入的消息返回 null。
 */
export function createAgentBackendMessage(
  message: AgentBackendMessageSource
): AgentBackendMessage | null {
  if (message.status === 'error' || message.status === 'cancelled') {
    return null
  }

  if (message.role === 'user') {
    return { role: 'user', content: message.content }
  }

  if (message.role === 'assistant' && message.content.trim().length > 0) {
    return { role: 'assistant', content: message.content }
  }

  if (message.role === 'system') {
    return { role: 'system', content: message.content }
  }

  return null
}
