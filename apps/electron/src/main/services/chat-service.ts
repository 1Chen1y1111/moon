/**
 * 负责把 Electron main 的聊天服务入口委托给 server-core 会话运行时。
 * 本文件保留现有 IPC-facing service 形状，不再承载 agent loop 或落库编排细节。
 */

import {
  SessionManager,
  createChatTitle,
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider,
  type SessionManagerDependencies,
  type SessionOperationEventListener
} from '@moon/server-core/sessions'
import type {
  AgentOperationRecord,
  ChatAttachmentRecord,
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

export {
  createChatTitle,
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
}

export type ChatServiceDependencies = SessionManagerDependencies
export type ChatOperationEventListener = SessionOperationEventListener

/**
 * 维持 Electron main 侧原有 ChatService API，并把会话运行时调用转交给 SessionManager。
 */
export class ChatService {
  private readonly sessionManager: SessionManager

  constructor(dependencies: ChatServiceDependencies) {
    this.sessionManager = new SessionManager(dependencies)
  }

  /**
   * 列出当前持久化的聊天会话。
   */
  listSessions(): Promise<SessionRecord[]> {
    return this.sessionManager.listSessions()
  }

  /**
   * 列出指定会话下的话题。
   */
  listTopics(input: ListChatTopicsInput): Promise<TopicRecord[]> {
    return this.sessionManager.listTopics(input)
  }

  /**
   * 列出指定话题下的线程。
   */
  listThreads(input: ListChatThreadsInput): Promise<ThreadRecord[]> {
    return this.sessionManager.listThreads(input)
  }

  /**
   * 读取指定线程或会话默认线程的消息列表。
   */
  getMessages(input: GetChatMessagesInput): Promise<MessageRecord[]> {
    return this.sessionManager.getMessages(input)
  }

  /**
   * 创建一个空聊天会话并保留现有默认 provider/connection 解析语义。
   */
  createSession(): Promise<SessionRecord> {
    return this.sessionManager.createSession()
  }

  /**
   * 删除指定聊天会话。
   */
  deleteSession(input: DeleteChatSessionInput): Promise<void> {
    return this.sessionManager.deleteSession(input)
  }

  /**
   * 导入聊天附件并返回可持久化的附件记录。
   */
  importAttachment(input: ImportChatAttachmentInput): Promise<ChatAttachmentRecord> {
    return this.sessionManager.importAttachment(input)
  }

  /**
   * 创建消息 turn，但不启动模型执行。
   */
  createMessageTurn(input: CreateMessageTurnInput): Promise<CreateMessageTurnResult> {
    return this.sessionManager.createMessageTurn(input)
  }

  /**
   * 运行已经创建好的 agent operation，并把运行时事件转发给调用方。
   */
  runOperation(
    input: RunChatOperationInput,
    onEvent?: ChatOperationEventListener
  ): Promise<RunChatOperationResult> {
    return this.sessionManager.runOperation(input, onEvent)
  }

  /**
   * 创建并运行完整消息 turn，保持旧 IPC `sendMessage` 的组合语义。
   */
  sendMessage(
    input: SendChatMessageInput,
    onEvent?: ChatOperationEventListener
  ): Promise<SendMessageResult> {
    return this.sessionManager.sendMessage(input, onEvent)
  }

  /**
   * 取消正在运行的 operation。
   */
  cancelOperation(input: CancelAgentOperationInput): Promise<AgentOperationRecord> {
    return this.sessionManager.cancelOperation(input)
  }

  /**
   * 允许一个等待人工确认的工具调用。
   */
  approveToolCall(input: ApproveToolCallInput): Promise<ToolInvocationRecord> {
    return this.sessionManager.approveToolCall(input)
  }

  /**
   * 拒绝一个等待人工确认的工具调用。
   */
  rejectToolCall(input: RejectToolCallInput): Promise<ToolInvocationRecord> {
    return this.sessionManager.rejectToolCall(input)
  }
}
