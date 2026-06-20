/**
 * 负责把 sessions handler 集合注册到 transport-neutral RPC server 抽象。
 * 本层只做协议 channel 到会话入口的映射，不承载 Electron IPC 或 WebSocket 实现。
 */

import { RPC_CHANNELS } from '@moon/shared/protocol'
import type {
  ApproveToolCallInput,
  CancelAgentOperationInput,
  CreateMessageTurnInput,
  DeleteChatSessionInput,
  GetChatMessagesInput,
  ImportChatAttachmentInput,
  ListChatThreadsInput,
  ListChatTopicsInput,
  RejectToolCallInput,
  RunChatOperationInput,
  SendChatMessageInput
} from '@moon/shared/domain/chat-validation'
import type { ChatOperationEvent } from '@moon/shared/domain/chat'

import type { RpcServerPort } from '../types'
import type { SessionEventRouteHint, SessionEventSink, SessionHandlers } from '../../sessions'

/**
 * sessions 注册器当前负责处理的请求 channel，不包含只用于推送的 `session:event`。
 */
export const HANDLED_SESSION_CHANNELS = [
  RPC_CHANNELS.sessions.listSessions,
  RPC_CHANNELS.sessions.getMessages,
  RPC_CHANNELS.sessions.listTopics,
  RPC_CHANNELS.sessions.listThreads,
  RPC_CHANNELS.sessions.createSession,
  RPC_CHANNELS.sessions.deleteSession,
  RPC_CHANNELS.sessions.importAttachment,
  RPC_CHANNELS.sessions.createMessageTurn,
  RPC_CHANNELS.sessions.runOperation,
  RPC_CHANNELS.sessions.sendMessage,
  RPC_CHANNELS.sessions.cancelOperation,
  RPC_CHANNELS.sessions.approveToolCall,
  RPC_CHANNELS.sessions.rejectToolCall
] as const

/**
 * sessions RPC 事件发送器，当前只负责把运行时事件推到 `session:event`。
 */
export type SessionRpcEventEmitter = (
  channel: typeof RPC_CHANNELS.sessions.event,
  event: ChatOperationEvent,
  routeHint?: SessionEventRouteHint
) => void

/**
 * sessions RPC 请求上下文，承载当前调用方可用的协议事件出口。
 */
export type SessionRpcRequestContext = {
  emitSessionEvent?: SessionRpcEventEmitter
}

/**
 * 注册 sessions RPC handlers 所需的运行时依赖。
 */
export type RegisterSessionHandlersDependencies = {
  sessionHandlers: SessionHandlers
}

/**
 * 注册 sessions RPC handlers，并把所有调用委托给已创建好的 SessionHandlers。
 */
export function registerSessionHandlers(
  server: RpcServerPort<SessionRpcRequestContext>,
  { sessionHandlers }: RegisterSessionHandlersDependencies
): void {
  server.handle(RPC_CHANNELS.sessions.listSessions, () => sessionHandlers.listSessions())
  server.handle(RPC_CHANNELS.sessions.getMessages, (_context, input: GetChatMessagesInput) =>
    sessionHandlers.getMessages(input)
  )
  server.handle(RPC_CHANNELS.sessions.listTopics, (_context, input: ListChatTopicsInput) =>
    sessionHandlers.listTopics(input)
  )
  server.handle(RPC_CHANNELS.sessions.listThreads, (_context, input: ListChatThreadsInput) =>
    sessionHandlers.listThreads(input)
  )
  server.handle(RPC_CHANNELS.sessions.createSession, () => sessionHandlers.createSession())
  server.handle(RPC_CHANNELS.sessions.deleteSession, (_context, input: DeleteChatSessionInput) =>
    sessionHandlers.deleteSession(input)
  )
  server.handle(
    RPC_CHANNELS.sessions.importAttachment,
    (_context, input: ImportChatAttachmentInput) => sessionHandlers.importAttachment(input)
  )
  server.handle(
    RPC_CHANNELS.sessions.createMessageTurn,
    (_context, input: CreateMessageTurnInput) => sessionHandlers.createMessageTurn(input)
  )
  server.handle(RPC_CHANNELS.sessions.runOperation, (context, input: RunChatOperationInput) =>
    sessionHandlers.runOperation(input, createSessionEventSink(context))
  )
  server.handle(RPC_CHANNELS.sessions.sendMessage, (context, input: SendChatMessageInput) =>
    sessionHandlers.sendMessage(input, createSessionEventSink(context))
  )
  server.handle(
    RPC_CHANNELS.sessions.cancelOperation,
    (_context, input: CancelAgentOperationInput) => sessionHandlers.cancelOperation(input)
  )
  server.handle(RPC_CHANNELS.sessions.approveToolCall, (_context, input: ApproveToolCallInput) =>
    sessionHandlers.approveToolCall(input)
  )
  server.handle(RPC_CHANNELS.sessions.rejectToolCall, (_context, input: RejectToolCallInput) =>
    sessionHandlers.rejectToolCall(input)
  )
}

/**
 * 把运行时事件收口为内部 `session:event` 协议事件，由具体 transport adapter 再映射出去。
 */
function createSessionEventSink(context: SessionRpcRequestContext): SessionEventSink | undefined {
  if (!context.emitSessionEvent) {
    return undefined
  }

  return (event, routeHint) => {
    context.emitSessionEvent?.(RPC_CHANNELS.sessions.event, event, routeHint)
  }
}
