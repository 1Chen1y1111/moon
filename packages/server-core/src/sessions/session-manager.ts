/**
 * 负责 Moon 会话运行时的核心编排，承接消息 turn、agent operation 和事件落库。
 * 本文件属于可复用 server-core 边界，只依赖仓储接口，不依赖 Electron、IPC 或 renderer。
 */

import { join } from 'node:path'

import {
  createBackend,
  type AgentBackend
} from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
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
import type { ProjectRecord } from '@moon/shared/domain/project'
import {
  approveToolCallInputSchema,
  cancelAgentOperationInputSchema,
  createMessageTurnInputSchema,
  getChatMessagesInputSchema,
  importChatAttachmentInputSchema,
  deleteChatSessionInputSchema,
  listChatThreadsInputSchema,
  listChatTopicsInputSchema,
  rejectToolCallInputSchema,
  runChatOperationInputSchema,
  sendChatMessageInputSchema,
  type ApproveToolCallInput,
  type CancelAgentOperationInput,
  type CreateMessageTurnInput,
  type DeleteChatSessionInput,
  type GetChatMessagesInput,
  type ImportChatAttachmentInput,
  type ListChatThreadsInput,
  type ListChatTopicsInput,
  type RejectToolCallInput,
  type RunChatOperationInput,
  type SendChatMessageInput
} from '@moon/shared/domain/chat-validation'
import {
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
} from '@moon/shared/domain/chat-provider'
import type { AppSettings } from '@moon/shared/domain/settings'
import type { ProviderId } from '@moon/shared/domain/provider'
import type { SessionEventRouteHint } from './handlers'
import { SessionAgentEventApplier } from './session-agent-event-applier'
import { SessionAgentTargetRuntime } from './session-agent-target-runtime'
import { SessionAttachmentRuntime } from './session-attachment-runtime'
import { SessionConversationAccessRuntime } from './session-conversation-access-runtime'
import {
  SessionMessageTurnRuntime,
  createChatTitle
} from './session-message-turn-runtime'
import { SessionOperationLifecycleRuntime } from './session-operation-lifecycle-runtime'
import { SessionOperationRunnerRuntime } from './session-operation-runner-runtime'
import { SessionOperationRuntime } from './session-operation-runtime'
import { SessionSendMessageRuntime } from './session-send-message-runtime'
import { SessionSourceActivationRetryRuntime } from './session-source-activation-retry-runtime'
import {
  SessionAgentRuntime,
  type AgentBackendFactory,
  type SessionPermissionModeResolver,
  type SessionSourceActivator,
  type SessionSourceProvider
} from './session-agent-runtime'
import { SessionToolPermissionRuntime } from './session-tool-permission-runtime'

export type AgentOperationsRepositoryPort = {
  findById: (id: string) => Promise<AgentOperationRecord | null>
  save: (operation: AgentOperationRecord) => Promise<AgentOperationRecord>
}

export type MessagesRepositoryPort = {
  listByThread: (threadId: string) => Promise<MessageRecord[]>
  listByOperation: (operationId: string) => Promise<MessageRecord[]>
  save: (message: MessageRecord) => Promise<MessageRecord>
}

export type ProjectsRepositoryPort = {
  findById: (id: string) => Promise<ProjectRecord | null>
  getActiveProject: () => Promise<ProjectRecord | null>
}

export type SessionsRepositoryPort = {
  list: () => Promise<SessionRecord[]>
  findById: (id: string) => Promise<SessionRecord | null>
  save: (session: SessionRecord) => Promise<SessionRecord>
  deleteById: (id: string) => Promise<void>
}

export type SettingsRepositoryPort = {
  findLlmConnectionById: (id: string) => Promise<NormalizedLlmConnection | null>
  getProviderApiKey: (provider: ProviderId) => Promise<string>
  getSettings: () => Promise<AppSettings>
  selectDefaultLlmConnection: () => Promise<NormalizedLlmConnection | null>
}

export type ThreadsRepositoryPort = {
  findById: (id: string) => Promise<ThreadRecord | null>
  listBySession: (sessionId: string) => Promise<ThreadRecord[]>
  listByTopic: (topicId: string) => Promise<ThreadRecord[]>
  save: (thread: ThreadRecord) => Promise<ThreadRecord>
}

export type ToolInvocationsRepositoryPort = {
  findById: (id: string) => Promise<ToolInvocationRecord | null>
  save: (toolInvocation: ToolInvocationRecord) => Promise<ToolInvocationRecord>
}

export type TopicsRepositoryPort = {
  findById: (id: string) => Promise<TopicRecord | null>
  listBySession: (sessionId: string) => Promise<TopicRecord[]>
  save: (topic: TopicRecord) => Promise<TopicRecord>
}

export type SessionManagerDependencies = {
  agentOperationsRepository: AgentOperationsRepositoryPort
  agentBackend?: AgentBackend
  attachmentsDirectory?: string
  createAgentBackend?: AgentBackendFactory
  messagesRepository: MessagesRepositoryPort
  permissionModeResolver?: SessionPermissionModeResolver
  projectsRepository?: ProjectsRepositoryPort
  sessionsRepository: SessionsRepositoryPort
  settingsRepository: SettingsRepositoryPort
  sourceActivator?: SessionSourceActivator
  sourceProvider?: SessionSourceProvider
  threadsRepository: ThreadsRepositoryPort
  toolInvocationsRepository: ToolInvocationsRepositoryPort
  topicsRepository: TopicsRepositoryPort
}

export type SessionOperationEventListener = (
  event: ChatOperationEvent,
  routeHint?: SessionEventRouteHint
) => void

export {
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
}

export { createChatTitle }

/**
 * 编排聊天会话、agent operation、工具调用和消息持久化之间的主流程。
 */
export class SessionManager {
  private readonly agentEventApplier: SessionAgentEventApplier
  private readonly agentTargetRuntime: SessionAgentTargetRuntime
  private readonly agentRuntime: SessionAgentRuntime
  private readonly attachmentRuntime: SessionAttachmentRuntime
  private readonly attachmentsDirectory: string
  private readonly conversationAccessRuntime: SessionConversationAccessRuntime
  private readonly messageTurnRuntime: SessionMessageTurnRuntime
  private readonly operationLifecycleRuntime: SessionOperationLifecycleRuntime
  private readonly operationRunnerRuntime: SessionOperationRunnerRuntime
  private readonly sendMessageRuntime: SessionSendMessageRuntime
  private readonly toolPermissionRuntime: SessionToolPermissionRuntime

  /**
   * 注入会话运行时所需的持久化端口和 backend 工厂。
   */
  constructor({
    agentOperationsRepository,
    agentBackend,
    attachmentsDirectory,
    createAgentBackend,
    messagesRepository,
    permissionModeResolver,
    projectsRepository,
    sessionsRepository,
    settingsRepository,
    sourceActivator,
    sourceProvider,
    threadsRepository,
    toolInvocationsRepository,
    topicsRepository
  }: SessionManagerDependencies) {
    const resolvedCreateAgentBackend: AgentBackendFactory =
      createAgentBackend ?? ((config) => agentBackend ?? createBackend(config))

    this.agentTargetRuntime = new SessionAgentTargetRuntime({
      sessionsRepository,
      settingsRepository
    })
    this.messageTurnRuntime = new SessionMessageTurnRuntime({
      agentOperationsRepository,
      messagesRepository,
      projectsRepository,
      sessionsRepository,
      threadsRepository,
      topicsRepository
    })
    this.agentRuntime = new SessionAgentRuntime({
      createAgentBackend: resolvedCreateAgentBackend,
      permissionModeResolver,
      sourceActivator,
      sourceProvider
    })
    this.toolPermissionRuntime = new SessionToolPermissionRuntime({
      agentOperationsRepository,
      toolInvocationsRepository
    })
    this.agentEventApplier = new SessionAgentEventApplier({
      agentOperationsRepository,
      clearPendingToolPermission: (toolInvocationId) =>
        this.toolPermissionRuntime.clearPendingToolPermission(toolInvocationId),
      messagesRepository,
      recordActivatedSource: (threadId, sourceSlug) =>
        this.agentRuntime.recordActivatedSource(threadId, sourceSlug),
      recordProviderSessionId: (threadId, providerSessionId) =>
        this.agentRuntime.recordProviderSessionId(threadId, providerSessionId),
      threadsRepository,
      toolInvocationsRepository,
      trackPendingToolPermission: (toolInvocation, operationId) =>
        this.toolPermissionRuntime.trackPendingToolPermission(toolInvocation, operationId)
    })
    this.attachmentsDirectory = attachmentsDirectory ?? join(process.cwd(), '.moon-attachments')
    this.attachmentRuntime = new SessionAttachmentRuntime({
      attachmentsDirectory: this.attachmentsDirectory
    })
    this.conversationAccessRuntime = new SessionConversationAccessRuntime({
      messagesRepository,
      sessionsRepository,
      threadsRepository,
      topicsRepository
    })
    this.operationLifecycleRuntime = new SessionOperationLifecycleRuntime({
      agentOperationsRepository,
      messagesRepository,
      toolPermissionRuntime: this.toolPermissionRuntime
    })
    const operationRuntime = new SessionOperationRuntime({
      agentEventApplier: this.agentEventApplier,
      agentOperationsRepository,
      agentRuntime: this.agentRuntime,
      attachmentsDirectory: this.attachmentsDirectory,
      messagesRepository,
      sessionsRepository,
      toolPermissionRuntime: this.toolPermissionRuntime
    })
    const sourceActivationRetryRuntime = new SessionSourceActivationRetryRuntime({
      sendMessage: (input, onEvent) => this.sendMessage(input, onEvent)
    })
    this.operationRunnerRuntime = new SessionOperationRunnerRuntime({
      agentOperationsRepository,
      agentTargetRuntime: this.agentTargetRuntime,
      messagesRepository,
      operationLifecycleRuntime: this.operationLifecycleRuntime,
      operationRuntime,
      projectsRepository,
      sessionsRepository,
      sourceActivationRetryRuntime,
      threadsRepository,
      topicsRepository
    })
    this.sendMessageRuntime = new SessionSendMessageRuntime({
      createMessageTurn: (input) => this.createMessageTurn(input),
      runOperation: (input, onEvent) => this.runOperation(input, onEvent)
    })
  }

  /**
   * 列出当前 runtime 可见的聊天会话。
   */
  listSessions(): Promise<SessionRecord[]> {
    return this.conversationAccessRuntime.listSessions()
  }

  /**
   * 按会话读取话题列表，调用边界止于仓储查询。
   */
  async listTopics(input: ListChatTopicsInput): Promise<TopicRecord[]> {
    const parsedInput = listChatTopicsInputSchema.parse(input)

    return this.conversationAccessRuntime.listTopics(parsedInput.sessionId)
  }

  /**
   * 按话题读取线程列表，用于 renderer 展示当前会话分支。
   */
  async listThreads(input: ListChatThreadsInput): Promise<ThreadRecord[]> {
    const parsedInput = listChatThreadsInputSchema.parse(input)

    return this.conversationAccessRuntime.listThreads(parsedInput.topicId)
  }

  /**
   * 读取指定线程消息；未传 threadId 时回退到会话默认线程。
   */
  async getMessages(input: GetChatMessagesInput): Promise<MessageRecord[]> {
    const parsedInput = getChatMessagesInputSchema.parse(input)

    return this.conversationAccessRuntime.getMessages(parsedInput)
  }

  /**
   * 创建空聊天会话，并绑定当前默认 provider/connection 与 active project。
   */
  async createSession(): Promise<SessionRecord> {
    const target = await this.agentTargetRuntime.resolveDefaultTarget()

    return this.messageTurnRuntime.createSession({ target })
  }

  /**
   * 删除指定会话；当前 runtime 不额外清理附件目录。
   */
  async deleteSession(input: DeleteChatSessionInput): Promise<void> {
    const parsedInput = deleteChatSessionInputSchema.parse(input)

    await this.conversationAccessRuntime.deleteSession(parsedInput.sessionId)
  }

  /**
   * 把 renderer 传入的附件写入 runtime 附件目录，并返回聊天域附件记录。
   */
  async importAttachment(input: ImportChatAttachmentInput): Promise<ChatAttachmentRecord> {
    const parsedInput = importChatAttachmentInputSchema.parse(input)

    return this.attachmentRuntime.importAttachment(parsedInput)
  }

  /**
   * 创建一次用户消息和待填充助手消息，准备 operation 但不启动模型执行。
   */
  async createMessageTurn(input: CreateMessageTurnInput): Promise<CreateMessageTurnResult> {
    const parsedInput = createMessageTurnInputSchema.parse(input)
    const target = await this.agentTargetRuntime.resolveMessageTarget(parsedInput)

    return this.messageTurnRuntime.create({ input: parsedInput, target })
  }

  /**
   * 执行已创建的 operation，消费 AgentEvent 并持续更新消息、工具和 operation 状态。
   */
  async runOperation(
    input: RunChatOperationInput,
    onEvent?: SessionOperationEventListener
  ): Promise<RunChatOperationResult> {
    const parsedInput = runChatOperationInputSchema.parse(input)

    return this.operationRunnerRuntime.run({
      onEvent,
      operationId: parsedInput.operationId
    })
  }

  /**
   * 组合创建 turn 与执行 operation，维持旧 `sendMessage` 的单调用语义。
   */
  async sendMessage(
    input: SendChatMessageInput,
    onEvent?: SessionOperationEventListener
  ): Promise<SendMessageResult> {
    const parsedInput = sendChatMessageInputSchema.parse(input)

    return this.sendMessageRuntime.send({ input: parsedInput, onEvent })
  }

  /**
   * 取消正在运行的 operation，并拒绝该 operation 下仍在等待的权限请求。
   */
  async cancelOperation(input: CancelAgentOperationInput): Promise<AgentOperationRecord> {
    const parsedInput = cancelAgentOperationInputSchema.parse(input)

    return this.operationLifecycleRuntime.cancel({ operationId: parsedInput.operationId })
  }

  /**
   * 批准等待中的工具权限请求，并把允许决策送回对应 backend。
   */
  async approveToolCall(input: ApproveToolCallInput): Promise<ToolInvocationRecord> {
    const parsedInput = approveToolCallInputSchema.parse(input)

    return this.toolPermissionRuntime.approve({
      toolInvocationId: parsedInput.toolInvocationId,
      ...(parsedInput.alwaysAllow === undefined ? {} : { alwaysAllow: parsedInput.alwaysAllow })
    })
  }

  /**
   * 拒绝等待中的工具权限请求，并把拒绝决策送回对应 backend。
   */
  async rejectToolCall(input: RejectToolCallInput): Promise<ToolInvocationRecord> {
    const parsedInput = rejectToolCallInputSchema.parse(input)

    return this.toolPermissionRuntime.reject({
      toolInvocationId: parsedInput.toolInvocationId,
      reason: parsedInput.reason
    })
  }
}
