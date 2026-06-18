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

import type { RpcServerPort } from '../types'
import type { SessionEventSink, SessionHandlers } from '../../sessions'

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
 * 注册 sessions RPC handlers 所需的运行时依赖。
 */
export type RegisterSessionHandlersDependencies = {
  sessionHandlers: SessionHandlers
  eventSink?: SessionEventSink
}

/**
 * 注册 sessions RPC handlers，并把所有调用委托给已创建好的 SessionHandlers。
 */
export function registerSessionHandlers(
  server: RpcServerPort,
  { sessionHandlers, eventSink }: RegisterSessionHandlersDependencies
): void {
  server.handle(RPC_CHANNELS.sessions.listSessions, () => sessionHandlers.listSessions())
  server.handle(RPC_CHANNELS.sessions.getMessages, (input: GetChatMessagesInput) =>
    sessionHandlers.getMessages(input)
  )
  server.handle(RPC_CHANNELS.sessions.listTopics, (input: ListChatTopicsInput) =>
    sessionHandlers.listTopics(input)
  )
  server.handle(RPC_CHANNELS.sessions.listThreads, (input: ListChatThreadsInput) =>
    sessionHandlers.listThreads(input)
  )
  server.handle(RPC_CHANNELS.sessions.createSession, () => sessionHandlers.createSession())
  server.handle(RPC_CHANNELS.sessions.deleteSession, (input: DeleteChatSessionInput) =>
    sessionHandlers.deleteSession(input)
  )
  server.handle(RPC_CHANNELS.sessions.importAttachment, (input: ImportChatAttachmentInput) =>
    sessionHandlers.importAttachment(input)
  )
  server.handle(RPC_CHANNELS.sessions.createMessageTurn, (input: CreateMessageTurnInput) =>
    sessionHandlers.createMessageTurn(input)
  )
  server.handle(RPC_CHANNELS.sessions.runOperation, (input: RunChatOperationInput) =>
    sessionHandlers.runOperation(input, eventSink)
  )
  server.handle(RPC_CHANNELS.sessions.sendMessage, (input: SendChatMessageInput) =>
    sessionHandlers.sendMessage(input, eventSink)
  )
  server.handle(RPC_CHANNELS.sessions.cancelOperation, (input: CancelAgentOperationInput) =>
    sessionHandlers.cancelOperation(input)
  )
  server.handle(RPC_CHANNELS.sessions.approveToolCall, (input: ApproveToolCallInput) =>
    sessionHandlers.approveToolCall(input)
  )
  server.handle(RPC_CHANNELS.sessions.rejectToolCall, (input: RejectToolCallInput) =>
    sessionHandlers.rejectToolCall(input)
  )
}
