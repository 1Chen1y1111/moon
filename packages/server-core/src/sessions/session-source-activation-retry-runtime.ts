/**
 * 负责处理 source activation 后的同会话自动重试编排。
 * 它只决定是否重发以及如何组装重发输入，不拥有 source 状态或消息持久化。
 */

import type {
  AgentOperationRecord,
  ChatOperationEvent,
  SendMessageResult
} from '@moon/shared/domain/chat'
import type { SendChatMessageInput } from '@moon/shared/domain/chat-validation'
import type { SessionEventRouteHint } from './handlers'
import type { SessionSourceActivationSignal } from './session-agent-event-applier'
import type { SessionSourceProviderScope } from './session-agent-runtime'

export type SessionSourceActivationRetrySender = (
  input: SendChatMessageInput,
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
) => Promise<SendMessageResult>

export type SessionSourceActivationRetryRuntimeInput = {
  sendMessage: SessionSourceActivationRetrySender
}

export type SessionSourceActivationRetryRuntimeRunInput = {
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
  operation: AgentOperationRecord
  scope: SessionSourceProviderScope
  sourceActivation: SessionSourceActivationSignal | null
}

/**
 * 复用原始用户消息触发下一轮 sendMessage，让已激活 source 由 session runtime state 生效。
 */
export class SessionSourceActivationRetryRuntime {
  private readonly sendMessage: SessionSourceActivationRetrySender

  /**
   * 注入用于创建下一轮消息的 sendMessage 能力，避免 runtime 反向依赖 SessionManager。
   */
  constructor({ sendMessage }: SessionSourceActivationRetryRuntimeInput) {
    this.sendMessage = sendMessage
  }

  /**
   * 当 source activation 携带有效原始消息时，在同一 thread 下自动重发。
   */
  async run({
    onEvent,
    operation,
    scope,
    sourceActivation
  }: SessionSourceActivationRetryRuntimeRunInput): Promise<void> {
    const originalMessage = sourceActivation?.originalMessage

    if (
      sourceActivation === null ||
      originalMessage === undefined ||
      originalMessage.trim().length === 0
    ) {
      return
    }

    const llmConnectionId =
      typeof operation.appContext?.llmConnectionId === 'string'
        ? operation.appContext.llmConnectionId
        : undefined
    const provider = operation.provider ?? scope.session.provider

    await this.sendMessage(
      {
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        projectId: scope.project?.id ?? null,
        provider,
        ...(llmConnectionId === undefined ? {} : { llmConnectionId }),
        content: originalMessage
      },
      onEvent
    )
  }
}
