/**
 * 负责处理 Claude tool_result 中暴露的 inactive source tool 错误。
 * 它只请求宿主激活 source 并记录 pending restart，不决定事件 drain、auto-retry 或真实 tool 执行。
 */

import type { AgentSourceRuntime } from '../../core/agent-source-runtime'
import type { PendingSourceActivationRestart } from '../../source-activation-drain'
import type { AgentEvent, AgentSourceActivationCallback } from '../types'

type ToolResultAgentEvent = Extract<AgentEvent, { type: 'tool_result' }>

export type ClaudeSourceActivationToolResultHandlerInput = {
  event: ToolResultAgentEvent
  originalMessage: string
  requestSourceActivation?: AgentSourceActivationCallback | null
  setPendingSourceActivationRestart: (pending: PendingSourceActivationRestart) => void
  sourceRuntime: AgentSourceRuntime
}

/**
 * 识别 inactive MCP source tool 错误；激活成功后记录批次边界需要发出的 restart 信号。
 */
export async function handleClaudeSourceActivationToolResult({
  event,
  originalMessage,
  requestSourceActivation,
  setPendingSourceActivationRestart,
  sourceRuntime
}: ClaudeSourceActivationToolResultHandlerInput): Promise<void> {
  if (!event.isError || requestSourceActivation == null) {
    return
  }

  const inactiveSourceError = sourceRuntime.detectInactiveSourceToolError(
    event.toolName ?? '',
    typeof event.result === 'string' ? event.result : ''
  )

  if (inactiveSourceError === null) {
    return
  }

  try {
    const activated = await requestSourceActivation(inactiveSourceError.sourceSlug)

    if (activated) {
      setPendingSourceActivationRestart({
        sourceSlug: inactiveSourceError.sourceSlug,
        originalMessage
      })
    }
  } catch {
    // 保留原始 tool_result 错误，让现有事件流继续向下游呈现失败原因。
  }
}
