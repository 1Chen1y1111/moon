/**
 * 负责把 agent 消息上下文转换成 provider 调用需要的 prompt 文本。
 * 它只做纯数据选择和串行化，不负责 SDK 参数、权限判断或文件系统访问。
 */

import type { AgentBackendMessage, AgentBackendWorkspace } from '../backend/types'

export type AgentPromptBuilderInput = {
  fallbackMessage: string
  messages: AgentBackendMessage[]
  sourceContextBlock?: string
  workspace?: AgentBackendWorkspace
}

/**
 * 根据 workspace 上下文选择本轮应该进入 prompt 的历史消息。
 */
function selectPromptMessages(
  messages: AgentBackendMessage[],
  workspace?: AgentBackendWorkspace
): AgentBackendMessage[] {
  return workspace === undefined
    ? messages
    : messages.filter((message) => message.role !== 'system')
}

/**
 * 将选中的历史消息串行化为当前 Claude SDK 链路沿用的纯文本格式。
 */
function serializePromptMessages(
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

/**
 * 构造 agent backend 单轮调用使用的 prompt，并封装 workspace 下的上下文选择规则。
 */
export class AgentPromptBuilder {
  /**
   * 返回 provider 调用需要的 prompt 文本；当 source context 存在时放在消息正文前。
   */
  build({
    fallbackMessage,
    messages,
    sourceContextBlock,
    workspace
  }: AgentPromptBuilderInput): string {
    const serializedMessages = serializePromptMessages(
      selectPromptMessages(messages, workspace),
      fallbackMessage
    )
    const normalizedSourceContextBlock = sourceContextBlock?.trim()

    return normalizedSourceContextBlock === undefined || normalizedSourceContextBlock.length === 0
      ? serializedMessages
      : `${normalizedSourceContextBlock}\n\n${serializedMessages}`
  }
}
