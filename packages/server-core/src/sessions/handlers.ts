/**
 * 负责把 session runtime 方法整理成可注册到 RPC/IPC adapter 的 handler 集合。
 * 本层只做入口委托和事件 sink 透传，不承载 Electron、传输或持久化实现。
 */

import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
  ChatOperationEvent,
  CreateMessageTurnResult,
  MessageRecord,
  RunChatOperationResult,
  SendMessageResult,
  SessionRecord,
  ThreadRecord,
  ToolInvocationRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
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

/**
 * server-core 内部统一的 session event listener，后续可映射到 Craft 风格 `session:event`。
 */
export type SessionEventListener = (event: ChatOperationEvent) => void

/**
 * session event sink 是 handler 层对外暴露的事件出口，当前与 listener 语义一致。
 */
export type SessionEventSink = SessionEventListener

export type SessionHandlerRuntime = {
  listSessions: () => Promise<SessionRecord[]>
  getMessages: (input: GetChatMessagesInput) => Promise<MessageRecord[]>
  listTopics: (input: ListChatTopicsInput) => Promise<TopicRecord[]>
  listThreads: (input: ListChatThreadsInput) => Promise<ThreadRecord[]>
  createSession: () => Promise<SessionRecord>
  deleteSession: (input: DeleteChatSessionInput) => Promise<void>
  importAttachment: (input: ImportChatAttachmentInput) => Promise<ChatAttachmentRecord>
  createMessageTurn: (input: CreateMessageTurnInput) => Promise<CreateMessageTurnResult>
  runOperation: (
    input: RunChatOperationInput,
    eventSink?: SessionEventSink
  ) => Promise<RunChatOperationResult>
  sendMessage: (
    input: SendChatMessageInput,
    eventSink?: SessionEventSink
  ) => Promise<SendMessageResult>
  cancelOperation: (input: CancelAgentOperationInput) => Promise<AgentOperationRecord>
  approveToolCall: (input: ApproveToolCallInput) => Promise<ToolInvocationRecord>
  rejectToolCall: (input: RejectToolCallInput) => Promise<ToolInvocationRecord>
}

export type CreateSessionHandlersDependencies = {
  sessionManager: SessionHandlerRuntime
}

export type SessionHandlers = SessionHandlerRuntime

/**
 * 创建 sessions handler 集合，作为未来 RPC handler 注册和当前 Electron service 的共同入口。
 */
export function createSessionHandlers({
  sessionManager
}: CreateSessionHandlersDependencies): SessionHandlers {
  return {
    listSessions: () => sessionManager.listSessions(),
    getMessages: (input) => sessionManager.getMessages(input),
    listTopics: (input) => sessionManager.listTopics(input),
    listThreads: (input) => sessionManager.listThreads(input),
    createSession: () => sessionManager.createSession(),
    deleteSession: (input) => sessionManager.deleteSession(input),
    importAttachment: (input) => sessionManager.importAttachment(input),
    createMessageTurn: (input) => sessionManager.createMessageTurn(input),
    runOperation: (input, eventSink) => sessionManager.runOperation(input, eventSink),
    sendMessage: (input, eventSink) => sessionManager.sendMessage(input, eventSink),
    cancelOperation: (input) => sessionManager.cancelOperation(input),
    approveToolCall: (input) => sessionManager.approveToolCall(input),
    rejectToolCall: (input) => sessionManager.rejectToolCall(input)
  }
}
