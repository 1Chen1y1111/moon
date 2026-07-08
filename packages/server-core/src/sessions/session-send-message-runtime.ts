/**
 * 负责 `sendMessage` 单调用语义的 server-core 内部编排。
 * 它只串联 turn 创建、message-created 事件和 operation 启动，不直接持久化或执行 backend。
 */

import type {
  ChatOperationEvent,
  CreateMessageTurnResult,
  RunChatOperationResult,
  SendMessageResult,
  SessionRecord
} from '@moon/shared/domain/chat'
import type {
  CreateMessageTurnInput,
  RunChatOperationInput,
  SendChatMessageInput
} from '@moon/shared/domain/chat-validation'
import type { SessionEventRouteHint } from './handlers'

export type SessionSendMessageCreateTurn = (
  input: CreateMessageTurnInput
) => Promise<CreateMessageTurnResult>

export type SessionSendMessageRunOperation = (
  input: RunChatOperationInput,
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
) => Promise<RunChatOperationResult>

export type SessionSendMessageRuntimeInput = {
  createMessageTurn: SessionSendMessageCreateTurn
  runOperation: SessionSendMessageRunOperation
}

export type SessionSendMessageRuntimeSendInput = {
  input: SendChatMessageInput
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
}

/**
 * 根据会话记录生成内部事件路由提示。
 * 这里不改变对 renderer 广播的事件 payload。
 */
function createSessionEventRouteHint(session: SessionRecord): SessionEventRouteHint {
  return { workspaceId: session.projectId }
}

/**
 * 编排一次 sendMessage，保持旧接口“创建消息并立即运行”的对外语义。
 */
export class SessionSendMessageRuntime {
  private readonly createMessageTurn: SessionSendMessageCreateTurn
  private readonly runOperation: SessionSendMessageRunOperation

  /**
   * 注入已存在的 turn 创建和 operation 运行能力，避免 runtime 反向拥有 SessionManager。
   */
  constructor({ createMessageTurn, runOperation }: SessionSendMessageRuntimeInput) {
    this.createMessageTurn = createMessageTurn
    this.runOperation = runOperation
  }

  /**
   * 创建真实 turn 后先广播两条 message-created，再启动对应 operation。
   */
  async send({ input, onEvent }: SessionSendMessageRuntimeSendInput): Promise<SendMessageResult> {
    const turn = await this.createMessageTurn(input)
    const eventRouteHint = createSessionEventRouteHint(turn.session)

    onEvent?.(
      {
        type: 'message-created',
        operationId: turn.operation.id,
        session: turn.session,
        topic: turn.topic,
        thread: turn.thread,
        message: turn.userMessage
      },
      eventRouteHint
    )
    onEvent?.(
      {
        type: 'message-created',
        operationId: turn.operation.id,
        session: turn.session,
        topic: turn.topic,
        thread: turn.thread,
        message: turn.assistantMessage
      },
      eventRouteHint
    )

    const runResult = await this.runOperation({ operationId: turn.operation.id }, onEvent)

    return {
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      operation: runResult.operation,
      messages: runResult.messages
    }
  }
}
