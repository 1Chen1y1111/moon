/**
 * 负责把 agent 消息上下文转换成 provider 调用需要的 prompt 文本。
 * 它只做纯数据选择和串行化，不负责 SDK 参数、权限判断或文件系统访问。
 */

import type { AgentBackendMessage, AgentBackendWorkspace } from '../backend/types'
import type { AgentSessionRuntimeState } from './session-runtime-state'
import type { AgentPermissionMode } from './types'

export type SessionContextBlockInput = {
  agentSessionState?: AgentSessionRuntimeState
  permissionMode?: AgentPermissionMode
  workspace?: AgentBackendWorkspace
}

export type PromptBuilderInput = {
  fallbackMessage: string
  messages: AgentBackendMessage[]
  sessionContextBlock?: string
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
 * 将 prompt context 值压成单行，避免 command/path 内换行破坏 `<session_state>` 结构。
 */
function serializeContextValue(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, ' ').trim())
}

/**
 * 拼接一条 session permission grant 摘要，保留当前权限记忆的精确匹配字段。
 */
function serializePermissionGrant(
  grant: AgentSessionRuntimeState['permissionGrants'][number]
): string {
  const fields = [
    grant.type === undefined ? undefined : `type=${serializeContextValue(grant.type)}`,
    `toolName=${serializeContextValue(grant.toolName)}`,
    grant.path === undefined ? undefined : `path=${serializeContextValue(grant.path)}`,
    grant.command === undefined ? undefined : `command=${serializeContextValue(grant.command)}`
  ].filter((field): field is string => field !== undefined)

  return `- ${fields.join(' ')}`
}

/**
 * 拼接一条 source guide 已读记录，供模型理解本会话已满足的 source prerequisite。
 */
function serializeSourceGuideRead(
  read: AgentSessionRuntimeState['sourceGuideReads'][number]
): string {
  return [
    `- sourceSlug=${serializeContextValue(read.sourceSlug)}`,
    `guidePath=${serializeContextValue(read.guidePath)}`
  ].join(' ')
}

/**
 * 拼接一条已激活 source 记录，供模型理解当前 thread session 的 source activation 事实。
 */
function serializeActivatedSourceSlug(sourceSlug: string): string {
  return `- sourceSlug=${serializeContextValue(sourceSlug)}`
}

/**
 * 构造注入 provider prompt 的最小会话运行态上下文。
 */
export function buildSessionContextBlock({
  agentSessionState,
  permissionMode = 'ask',
  workspace
}: SessionContextBlockInput): string {
  const lines = ['<session_state>', `permissionMode: ${permissionMode}`]

  if (workspace?.path !== undefined) {
    lines.push(`workspacePath: ${workspace.path}`)
  }

  if (agentSessionState !== undefined && agentSessionState.activatedSourceSlugs.length > 0) {
    lines.push(
      'activatedSources:',
      ...agentSessionState.activatedSourceSlugs.map(serializeActivatedSourceSlug)
    )
  }

  if (agentSessionState !== undefined && agentSessionState.permissionGrants.length > 0) {
    lines.push(
      'permissionGrants:',
      ...agentSessionState.permissionGrants.map(serializePermissionGrant)
    )
  }

  if (agentSessionState !== undefined && agentSessionState.sourceGuideReads.length > 0) {
    lines.push(
      'sourceGuideReads:',
      ...agentSessionState.sourceGuideReads.map(serializeSourceGuideRead)
    )
  }

  lines.push('</session_state>')

  return lines.join('\n')
}

/**
 * 构造 agent backend 单轮调用使用的 prompt，并封装 workspace 下的上下文选择规则。
 */
export class PromptBuilder {
  /**
   * 返回 provider 调用需要的 prompt 文本；session context 和 source context 会按固定顺序放在消息正文前。
   */
  build({
    fallbackMessage,
    messages,
    sessionContextBlock,
    sourceContextBlock,
    workspace
  }: PromptBuilderInput): string {
    const serializedMessages = serializePromptMessages(
      selectPromptMessages(messages, workspace),
      fallbackMessage
    )
    const normalizedSessionContextBlock = sessionContextBlock?.trim()
    const normalizedSourceContextBlock = sourceContextBlock?.trim()
    const contextBlocks = [normalizedSessionContextBlock, normalizedSourceContextBlock].filter(
      (block): block is string => block !== undefined && block.length > 0
    )

    return contextBlocks.length === 0
      ? serializedMessages
      : `${contextBlocks.join('\n\n')}\n\n${serializedMessages}`
  }
}
