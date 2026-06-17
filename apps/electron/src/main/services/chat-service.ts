/**
 * 负责聊天会话的主流程编排和持久化协调。
 * 它只消费统一 agent 事件并更新仓储，不直接暴露 SDK 私有事件或 renderer 状态。
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  assertLlmConnectionReadyForAgent,
  assertProviderReadyForAgent,
  createAgent,
  createConnectionAgentBackendConfig,
  createAgentBackendMessage,
  buildAgentRuntimeSystemPrompt,
  createProviderLlmConnection,
  type AgentBackend,
  type AgentBackendConfig,
  type AgentBackendMessage,
  type AgentEvent,
  type AgentPermissionMode,
  type AgentPermissionDecision
} from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
import type { AgentOperationsRepository } from '../repositories/agent-operations-repository'
import type { MessagesRepository } from '../repositories/messages-repository'
import type { ProjectsRepository } from '../repositories/projects-repository'
import type { SessionsRepository } from '../repositories/sessions-repository'
import type { ThreadsRepository } from '../repositories/threads-repository'
import type { ToolInvocationsRepository } from '../repositories/tool-invocations-repository'
import type { TopicsRepository } from '../repositories/topics-repository'
import type {
  AgentOperationRecord,
  ChatAttachmentKind,
  ChatAttachmentRecord,
  ChatJsonObject,
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
import { defaultChatUserId } from '@moon/shared/domain/chat'
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
import type { ProviderSettings } from '@moon/shared/domain/settings'
import type { ProviderId } from '@moon/shared/domain/provider'
import type { SettingsRepository } from '../repositories/settings-repository'
import { createAgentRuntimeBackend } from './agent-runtime-backend'

const newChatTitle = '新聊天'
const defaultTopicTitle = '默认话题'
const defaultThreadTitle = '主线'
const titleMaxLength = 48
const defaultAgentPermissionMode = 'ask' satisfies AgentPermissionMode

type ChatServiceDependencies = {
  agentOperationsRepository: AgentOperationsRepository
  agentBackend?: AgentBackend
  attachmentsDirectory?: string
  createAgentBackend?: AgentBackendFactory
  messagesRepository: MessagesRepository
  projectsRepository?: ProjectsRepository
  sessionsRepository: SessionsRepository
  settingsRepository: SettingsRepository
  threadsRepository: ThreadsRepository
  toolInvocationsRepository: ToolInvocationsRepository
  topicsRepository: TopicsRepository
}

type ChatOperationEventListener = (event: ChatOperationEvent) => void

type AgentInfoPayload = Extract<AgentEvent, { type: 'info' }>
type AgentPermissionPayload = Extract<AgentEvent, { type: 'permission_request' }>
type AgentStatusPayload = Extract<AgentEvent, { type: 'status' }>
type AgentEventUsagePayload = Extract<AgentEvent, { type: 'usage_update' }>['usage']

type AgentEventApplicationResult = {
  message: MessageRecord
  operation: AgentOperationRecord
}

type PendingToolPermission = {
  operationId: string
}

type ResolvedAgentTarget = {
  connection: NormalizedLlmConnection
  persistedLlmConnectionId: string | null
  providerId: ProviderId
  session: SessionRecord | null
}

type ConversationScope = {
  project: ProjectRecord | null
  session: SessionRecord
  topic: TopicRecord
  thread: ThreadRecord
}

type AgentBackendFactory = (config: AgentBackendConfig) => AgentBackend

/**
 * 创建当前时间戳，统一聊天落库记录的时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 根据 MIME 类型确定附件在聊天域里的粗粒度类型。
 */
function resolveAttachmentKind(mimeType: string): ChatAttachmentKind {
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

/**
 * 把 renderer 传入的二进制附件数据转换成 Node Buffer。
 */
function toBuffer(data: ArrayBuffer | ArrayBufferView): Buffer {
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

/**
 * 判断附件是否适合以内联文本形式注入模型上下文。
 */
function isTextAttachment(attachment: ChatAttachmentRecord): boolean {
  if (attachment.mimeType.startsWith('text/') || attachment.mimeType === 'application/json') {
    return true
  }

  const extension = attachment.name.split('.').at(-1)?.toLowerCase()

  return (
    extension !== undefined &&
    [
      'txt',
      'md',
      'markdown',
      'json',
      'csv',
      'log',
      'ts',
      'tsx',
      'js',
      'jsx',
      'css',
      'html',
      'xml',
      'yml',
      'yaml'
    ].includes(extension)
  )
}

/**
 * 把未知异常归一化成可展示、可持久化的错误文本。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * 把工具结果归一化成 JSON object，兼容工具返回基础类型的情况。
 */
function normalizeToolResult(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return { value }
}

/**
 * 把权限请求转换成工具参数，便于 UI 在不理解 SDK 私有结构时仍能展示风险信息。
 */
function createPermissionRequestArguments(
  request: AgentPermissionPayload['request']
): ChatJsonObject {
  return {
    description: request.description,
    ...(request.command === undefined ? {} : { command: request.command }),
    ...(request.type === undefined ? {} : { type: request.type }),
    ...(request.reason === undefined ? {} : { reason: request.reason }),
    ...(request.impact === undefined ? {} : { impact: request.impact })
  }
}

/**
 * 为拒绝类工具决策生成统一文案，避免 renderer 和 main 对默认文案各自发散。
 */
function resolveRejectedToolReason(reason?: string): string {
  return reason?.trim() || 'Rejected by user.'
}

/**
 * 生成只存在于本轮 backend 调用里的项目上下文消息，不持久化为聊天消息。
 */
function createProjectContextMessage(project: ProjectRecord): AgentBackendMessage {
  return {
    role: 'system',
    content: buildAgentRuntimeSystemPrompt({
      permissionMode: defaultAgentPermissionMode,
      workspace: {
        name: project.name,
        path: project.path
      }
    })
  }
}

/**
 * 把 agent usage 事件转换成可写入 JSON 字段的普通对象。
 */
function toAgentUsageJson(usage: AgentEventUsagePayload): ChatJsonObject {
  return { ...usage }
}

/**
 * 解析 usage 的总 token；provider 没有直接给出时按已知 token 字段求和。
 */
function resolveUsageTotalTokens(usage: AgentEventUsagePayload): number | undefined {
  if (usage.totalTokens !== undefined) {
    return usage.totalTokens
  }

  if (usage.inputTokens === undefined && usage.outputTokens === undefined) {
    return undefined
  }

  return (
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheCreationTokens ?? 0)
  )
}

/**
 * 把最新 usage 快照合并进 operation，保留未被本次事件覆盖的历史字段。
 */
function applyAgentUsageToOperation(
  operation: AgentOperationRecord,
  usage: AgentEventUsagePayload,
  timestamp: string
): AgentOperationRecord {
  const totalTokens = resolveUsageTotalTokens(usage)

  return {
    ...operation,
    ...(usage.inputTokens === undefined ? {} : { totalInputTokens: usage.inputTokens }),
    ...(usage.outputTokens === undefined ? {} : { totalOutputTokens: usage.outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(usage.costUsd === undefined ? {} : { totalCost: String(usage.costUsd) }),
    usage: {
      ...(operation.usage ?? {}),
      ...toAgentUsageJson(usage),
      ...(totalTokens === undefined ? {} : { totalTokens })
    },
    updatedAt: timestamp
  }
}

/**
 * 把 provider/SDK 自己的 session id 写入 operation metadata，避免混同 Moon 会话 id。
 */
function applyProviderSessionIdToOperation(
  operation: AgentOperationRecord,
  providerSessionId: string,
  timestamp: string
): AgentOperationRecord {
  return {
    ...operation,
    metadata: {
      ...(operation.metadata ?? {}),
      providerSessionId
    },
    updatedAt: timestamp
  }
}

/**
 * 把 agent 状态事件记录到 operation metadata，只保存最后一次状态快照。
 */
function applyAgentStatusToOperation(
  operation: AgentOperationRecord,
  status: AgentStatusPayload,
  timestamp: string
): AgentOperationRecord {
  return {
    ...operation,
    metadata: {
      ...(operation.metadata ?? {}),
      lastAgentStatus: {
        message: status.message,
        ...(status.statusType === undefined ? {} : { statusType: status.statusType }),
        updatedAt: timestamp
      }
    },
    updatedAt: timestamp
  }
}

/**
 * 把 agent 提示事件记录到 operation metadata，只保存最后一次提示快照。
 */
function applyAgentInfoToOperation(
  operation: AgentOperationRecord,
  info: AgentInfoPayload,
  timestamp: string
): AgentOperationRecord {
  return {
    ...operation,
    metadata: {
      ...(operation.metadata ?? {}),
      lastAgentInfo: {
        message: info.message,
        level: info.level ?? 'info',
        updatedAt: timestamp
      }
    },
    updatedAt: timestamp
  }
}

export {
  isOpenAICompatibleProvider,
  isSupportedChatProvider,
  selectChatModel,
  selectDefaultChatProvider
}

/**
 * 根据首条用户输入生成会话标题，空内容回退为默认新聊天标题。
 */
export function createChatTitle(content: string): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim()

  if (normalizedContent.length <= titleMaxLength) {
    return normalizedContent || newChatTitle
  }

  return `${normalizedContent.slice(0, titleMaxLength)}...`
}

/**
 * 读取本地附件内容，并把持久化消息转换成 backend 无关的上下文消息。
 */
async function toAgentBackendMessage(
  message: MessageRecord,
  attachmentsDirectory: string
): Promise<AgentBackendMessage | null> {
  let content = message.content

  if (message.role === 'user') {
    if ((message.attachments?.length ?? 0) > 0) {
      for (const attachment of message.attachments ?? []) {
        const data = await readFile(join(attachmentsDirectory, attachment.id))

        if (isTextAttachment(attachment)) {
          content = `${content}\n\n[Attachment: ${attachment.name}]\n${data.toString('utf8')}`
        } else {
          content = `${content}\n\n[Attachment: ${attachment.name}]\n非文本附件暂未注入 backend prompt。`
        }
      }
    }
  }

  return createAgentBackendMessage({ ...message, content })
}

/**
 * 编排聊天会话、agent operation、工具调用和消息持久化之间的主流程。
 */
export class ChatService {
  private readonly activeAgentBackends = new Map<string, AgentBackend>()
  private readonly activeOperations = new Map<string, AbortController>()
  private readonly agentOperationsRepository: AgentOperationsRepository
  private readonly attachmentsDirectory: string
  private readonly createAgentBackend: AgentBackendFactory
  private readonly messagesRepository: MessagesRepository
  private readonly operationEventListeners = new Map<string, ChatOperationEventListener>()
  private readonly pendingToolPermissions = new Map<string, PendingToolPermission>()
  private readonly projectsRepository?: ProjectsRepository
  private readonly sessionsRepository: SessionsRepository
  private readonly settingsRepository: SettingsRepository
  private readonly threadsRepository: ThreadsRepository
  private readonly toolInvocationsRepository: ToolInvocationsRepository
  private readonly topicsRepository: TopicsRepository

  constructor({
    agentOperationsRepository,
    agentBackend,
    attachmentsDirectory,
    createAgentBackend,
    messagesRepository,
    projectsRepository,
    sessionsRepository,
    settingsRepository,
    threadsRepository,
    toolInvocationsRepository,
    topicsRepository
  }: ChatServiceDependencies) {
    this.agentOperationsRepository = agentOperationsRepository
    this.createAgentBackend =
      createAgentBackend ?? ((config) => agentBackend ?? createAgent(config))
    this.attachmentsDirectory = attachmentsDirectory ?? join(process.cwd(), '.moon-attachments')
    this.messagesRepository = messagesRepository
    this.projectsRepository = projectsRepository
    this.sessionsRepository = sessionsRepository
    this.settingsRepository = settingsRepository
    this.threadsRepository = threadsRepository
    this.toolInvocationsRepository = toolInvocationsRepository
    this.topicsRepository = topicsRepository
  }

  listSessions(): Promise<SessionRecord[]> {
    return this.sessionsRepository.list()
  }

  async listTopics(input: ListChatTopicsInput): Promise<TopicRecord[]> {
    const parsedInput = listChatTopicsInputSchema.parse(input)

    return this.topicsRepository.listBySession(parsedInput.sessionId)
  }

  async listThreads(input: ListChatThreadsInput): Promise<ThreadRecord[]> {
    const parsedInput = listChatThreadsInputSchema.parse(input)

    return this.threadsRepository.listByTopic(parsedInput.topicId)
  }

  async getMessages(input: GetChatMessagesInput): Promise<MessageRecord[]> {
    const parsedInput = getChatMessagesInputSchema.parse(input)

    if (parsedInput.threadId !== undefined) {
      return this.messagesRepository.listByThread(parsedInput.threadId)
    }

    const thread = await this.getDefaultThread(parsedInput.sessionId)

    return thread === null ? [] : this.messagesRepository.listByThread(thread.id)
  }

  async createSession(): Promise<SessionRecord> {
    const target = await this.resolveDefaultAgentTarget()
    const project = await this.resolveInputProject({}, null)
    const scope = await this.createConversationScope(
      target.providerId,
      target.persistedLlmConnectionId,
      newChatTitle,
      project
    )

    return scope.session
  }

  async deleteSession(input: DeleteChatSessionInput): Promise<void> {
    const parsedInput = deleteChatSessionInputSchema.parse(input)

    await this.sessionsRepository.deleteById(parsedInput.sessionId)
  }

  async importAttachment(input: ImportChatAttachmentInput): Promise<ChatAttachmentRecord> {
    const parsedInput = importChatAttachmentInputSchema.parse(input)
    const id = randomUUID()
    const createdAt = createTimestamp()

    await mkdir(this.attachmentsDirectory, { recursive: true })
    await writeFile(join(this.attachmentsDirectory, id), toBuffer(parsedInput.data))

    return {
      id,
      name: parsedInput.name,
      mimeType: parsedInput.mimeType,
      size: parsedInput.size,
      kind: resolveAttachmentKind(parsedInput.mimeType),
      createdAt
    }
  }

  async createMessageTurn(input: CreateMessageTurnInput): Promise<CreateMessageTurnResult> {
    const parsedInput = createMessageTurnInputSchema.parse(input)
    const target = await this.resolveAgentTarget(parsedInput)
    const connection = target.connection
    const persistedLlmConnectionId = target.persistedLlmConnectionId
    const providerId = target.providerId
    const modelId = connection.model
    const project = await this.resolveInputProject(parsedInput, target.session)

    const scope = await this.resolveConversationScope(
      parsedInput,
      target.session,
      providerId,
      persistedLlmConnectionId,
      project
    )
    const operation = await this.createOperation(
      scope,
      providerId,
      connection,
      persistedLlmConnectionId,
      'idle'
    )
    const attachments = parsedInput.attachments ?? []
    const timestamp = createTimestamp()
    const previousMessages = await this.messagesRepository.listByThread(scope.thread.id)
    const parentMessage = [...previousMessages].reverse().find((message) => message.role !== 'tool')
    const userMessage = await this.messagesRepository.save({
      id: randomUUID(),
      sessionId: scope.session.id,
      topicId: scope.topic.id,
      threadId: scope.thread.id,
      ...(parentMessage === undefined ? {} : { parentId: parentMessage.id }),
      operationId: operation.id,
      role: 'user',
      content: parsedInput.content,
      status: 'complete',
      provider: providerId,
      model: modelId,
      ...(attachments.length === 0 ? {} : { attachments }),
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const title = createChatTitle(parsedInput.content || attachments[0]?.name || '')
    const sessionAfterUser = await this.touchSessionWithTitle(scope.session, title)
    const topicAfterUser = await this.touchTopicTitle(scope.topic, title)
    const threadAfterUser = await this.touchThreadTitle(scope.thread, title)
    const assistantTimestamp = createTimestamp()
    const assistantMessage = await this.messagesRepository.save({
      id: randomUUID(),
      sessionId: sessionAfterUser.id,
      topicId: topicAfterUser.id,
      threadId: threadAfterUser.id,
      parentId: userMessage.id,
      operationId: operation.id,
      role: 'assistant',
      content: '',
      reasoning: '',
      status: 'pending',
      provider: providerId,
      model: modelId,
      createdAt: assistantTimestamp,
      updatedAt: assistantTimestamp
    })

    return {
      session: sessionAfterUser,
      topic: topicAfterUser,
      thread: threadAfterUser,
      operation,
      userMessage,
      assistantMessage
    }
  }

  async runOperation(
    input: RunChatOperationInput,
    onEvent?: ChatOperationEventListener
  ): Promise<RunChatOperationResult> {
    const parsedInput = runChatOperationInputSchema.parse(input)
    const operation = await this.agentOperationsRepository.findById(parsedInput.operationId)

    if (operation === null) {
      throw new Error('Agent operation not found.')
    }

    const scope = await this.resolveOperationScope(operation)
    const target = await this.resolveOperationTarget(operation, scope.session)
    const connection = this.withOperationModel(target.connection, operation)

    const operationMessages = await this.messagesRepository.listByOperation(operation.id)
    const userMessage = operationMessages.find((message) => message.role === 'user')
    const assistantMessage = operationMessages.find((message) => message.role === 'assistant')

    if (userMessage === undefined || assistantMessage === undefined) {
      throw new Error('Agent operation messages not found.')
    }

    const startedAt = createTimestamp()
    const runningOperation = await this.agentOperationsRepository.save({
      ...operation,
      status: 'running',
      completionReason: null,
      error: null,
      startedAt: operation.startedAt ?? startedAt,
      updatedAt: startedAt
    })
    const streamingAssistantMessage = await this.messagesRepository.save({
      ...assistantMessage,
      status: 'streaming',
      error: null,
      updatedAt: startedAt
    })
    const abortController = new AbortController()

    onEvent?.({
      type: 'operation-started',
      operationId: runningOperation.id,
      operation: runningOperation
    })

    this.activeOperations.set(runningOperation.id, abortController)

    try {
      const result = await this.executeOperation({
        abortController,
        assistantMessage: streamingAssistantMessage,
        onEvent,
        operation: runningOperation,
        connection,
        scope
      })

      return {
        operation: result.operation,
        messages: result.messages
      }
    } finally {
      this.activeOperations.delete(runningOperation.id)
    }
  }

  async sendMessage(
    input: SendChatMessageInput,
    onEvent?: ChatOperationEventListener
  ): Promise<SendMessageResult> {
    const parsedInput = sendChatMessageInputSchema.parse(input)
    const turn = await this.createMessageTurn(parsedInput)

    onEvent?.({
      type: 'message-created',
      operationId: turn.operation.id,
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      message: turn.userMessage
    })
    onEvent?.({
      type: 'message-created',
      operationId: turn.operation.id,
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      message: turn.assistantMessage
    })

    const runResult = await this.runOperation({ operationId: turn.operation.id }, onEvent)

    return {
      session: turn.session,
      topic: turn.topic,
      thread: turn.thread,
      operation: runResult.operation,
      messages: runResult.messages
    }
  }

  /**
   * 取消正在运行的 operation，并拒绝该 operation 下仍在等待的权限请求。
   */
  async cancelOperation(input: CancelAgentOperationInput): Promise<AgentOperationRecord> {
    const parsedInput = cancelAgentOperationInputSchema.parse(input)
    const abortController = this.activeOperations.get(parsedInput.operationId)
    const timestamp = createTimestamp()

    abortController?.abort('cancelled')

    const operation = await this.agentOperationsRepository.findById(parsedInput.operationId)

    if (operation === null) {
      throw new Error('Agent operation not found.')
    }

    await this.rejectPendingToolPermissionsForOperation(operation.id, 'Cancelled by user.')

    const cancelledOperation = await this.agentOperationsRepository.save({
      ...operation,
      status: 'interrupted',
      completionReason: 'interrupted',
      error: null,
      updatedAt: timestamp,
      completedAt: timestamp
    })

    const operationMessages = await this.messagesRepository.listByOperation(operation.id)
    const assistantMessage = operationMessages.find((message) => message.role === 'assistant')

    if (assistantMessage !== undefined) {
      await this.messagesRepository.save({
        ...assistantMessage,
        status: 'cancelled',
        error: 'Cancelled by user.',
        updatedAt: timestamp
      })
    }

    return cancelledOperation
  }

  /**
   * 批准等待中的工具权限请求，并把允许决策送回对应 backend。
   */
  async approveToolCall(input: ApproveToolCallInput): Promise<ToolInvocationRecord> {
    const parsedInput = approveToolCallInputSchema.parse(input)

    return this.resolveToolPermissionDecision(parsedInput.toolInvocationId, {
      requestId: parsedInput.toolInvocationId,
      approved: true,
      ...(parsedInput.alwaysAllow === undefined ? {} : { alwaysAllow: parsedInput.alwaysAllow })
    })
  }

  /**
   * 拒绝等待中的工具权限请求，并把拒绝决策送回对应 backend。
   */
  async rejectToolCall(input: RejectToolCallInput): Promise<ToolInvocationRecord> {
    const parsedInput = rejectToolCallInputSchema.parse(input)

    return this.resolveToolPermissionDecision(parsedInput.toolInvocationId, {
      requestId: parsedInput.toolInvocationId,
      approved: false,
      reason: resolveRejectedToolReason(parsedInput.reason)
    })
  }

  /**
   * 把权限请求记录为待审批状态，供用户操作或取消 operation 时定位。
   */
  private trackPendingToolPermission(
    toolInvocation: ToolInvocationRecord,
    operationId: string
  ): void {
    this.pendingToolPermissions.set(toolInvocation.id, { operationId })
  }

  /**
   * 在权限审批结束后广播工具完成事件，让 renderer 从等待态恢复到运行态。
   */
  private emitToolPermissionResolvedEvent(
    operation: AgentOperationRecord,
    toolInvocation: ToolInvocationRecord
  ): void {
    const listener = this.operationEventListeners.get(operation.id)
    const sessionId =
      typeof operation.appContext?.sessionId === 'string' ? operation.appContext.sessionId : null

    if (
      listener === undefined ||
      sessionId === null ||
      operation.topicId == null ||
      operation.threadId == null
    ) {
      return
    }

    listener({
      type: 'tool-finish',
      operationId: operation.id,
      sessionId,
      topicId: operation.topicId,
      threadId: operation.threadId,
      messageId: toolInvocation.messageId,
      toolInvocation
    })
  }

  /**
   * 解析 UI 审批结果，更新工具状态，并把决策回传给正在等待的 agent backend。
   */
  private async resolveToolPermissionDecision(
    toolInvocationId: string,
    decision: AgentPermissionDecision,
    options: { resumeOperation: boolean } = { resumeOperation: true }
  ): Promise<ToolInvocationRecord> {
    const toolInvocation = await this.toolInvocationsRepository.findById(toolInvocationId)

    if (toolInvocation === null) {
      throw new Error('Tool invocation not found.')
    }

    if (toolInvocation.status !== 'waiting_for_human') {
      return toolInvocation
    }

    const timestamp = createTimestamp()
    const updatedToolInvocation = await this.toolInvocationsRepository.save({
      ...toolInvocation,
      status: decision.approved ? 'done' : 'rejected',
      result: decision.approved ? { approved: true } : null,
      error: decision.approved ? null : resolveRejectedToolReason(decision.reason),
      updatedAt: timestamp
    })
    const pendingPermission = this.pendingToolPermissions.get(toolInvocation.id)
    const operationId = toolInvocation.operationId ?? pendingPermission?.operationId

    this.pendingToolPermissions.delete(toolInvocation.id)

    if (operationId !== undefined) {
      const backend = this.activeAgentBackends.get(operationId)
      const operation = await this.agentOperationsRepository.findById(operationId)

      if (options.resumeOperation && backend !== undefined && operation !== null) {
        const resumedOperation = await this.agentOperationsRepository.save({
          ...operation,
          status: 'running',
          completionReason: null,
          updatedAt: timestamp
        })

        this.emitToolPermissionResolvedEvent(resumedOperation, updatedToolInvocation)
      }

      backend?.respondToPermission(
        decision.requestId,
        decision.approved,
        decision.approved ? (decision.alwaysAllow ?? false) : false
      )
    }

    return updatedToolInvocation
  }

  /**
   * operation 被取消时拒绝所有待处理权限，释放仍在等待用户决策的 backend。
   */
  private async rejectPendingToolPermissionsForOperation(
    operationId: string,
    reason: string
  ): Promise<void> {
    const pendingToolInvocationIds = [...this.pendingToolPermissions.entries()]
      .filter(([, pendingPermission]) => pendingPermission.operationId === operationId)
      .map(([toolInvocationId]) => toolInvocationId)

    await Promise.all(
      pendingToolInvocationIds.map((toolInvocationId) =>
        this.resolveToolPermissionDecision(
          toolInvocationId,
          {
            requestId: toolInvocationId,
            approved: false,
            reason
          },
          { resumeOperation: false }
        )
      )
    )
  }

  private async executeOperation({
    abortController,
    assistantMessage: initialAssistantMessage,
    connection,
    onEvent,
    operation,
    scope
  }: {
    abortController: AbortController
    assistantMessage: MessageRecord
    connection: NormalizedLlmConnection
    onEvent?: ChatOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
  }): Promise<SendMessageResult> {
    const eventScope = {
      project: scope.project,
      session: scope.session,
      topic: scope.topic,
      thread: scope.thread
    }
    let assistantMessage = initialAssistantMessage
    let currentOperation = operation
    const previousMessages = await this.messagesRepository.listByThread(scope.thread.id)

    const backendMessages = (
      await Promise.all(
        previousMessages
          .filter((message) => message.id !== assistantMessage.id)
          .map((message) => toAgentBackendMessage(message, this.attachmentsDirectory))
      )
    ).filter((message): message is AgentBackendMessage => message !== null)
    const scopedBackendMessages =
      scope.project === null
        ? backendMessages
        : [createProjectContextMessage(scope.project), ...backendMessages]
    const currentUserMessage =
      [...previousMessages].reverse().find((message) => message.role === 'user')?.content ?? ''
    const delegateBackend = this.createAgentBackend(
      createConnectionAgentBackendConfig(connection, scopedBackendMessages)
    )
    const agentBackend = createAgentRuntimeBackend({
      delegate: delegateBackend,
      permissionMode: defaultAgentPermissionMode,
      ...(scope.project === null
        ? {}
        : {
            workspace: {
              name: scope.project.name,
              path: scope.project.path
            }
          })
    })

    this.activeAgentBackends.set(operation.id, agentBackend)

    if (onEvent !== undefined) {
      this.operationEventListeners.set(operation.id, onEvent)
    }

    try {
      const agentEvents = agentBackend.chat(currentUserMessage, undefined, {
        abortSignal: abortController.signal
      })
      let agentEventResult = await agentEvents.next()

      while (!agentEventResult.done) {
        const agentEvent = agentEventResult.value
        const eventResult = await this.applyAgentEvent({
          event: agentEvent,
          message: assistantMessage,
          onEvent,
          operation: currentOperation,
          scope: eventScope
        })

        assistantMessage = eventResult.message
        currentOperation = eventResult.operation
        agentEventResult = await agentEvents.next()
      }

      const completedTimestamp = createTimestamp()

      if (assistantMessage.content.trim().length === 0 && !assistantMessage.reasoning) {
        throw new Error('Model returned an empty response.')
      }

      assistantMessage = await this.messagesRepository.save({
        ...assistantMessage,
        content: assistantMessage.content.trim(),
        status: 'complete',
        updatedAt: completedTimestamp
      })

      const completedOperation = await this.agentOperationsRepository.save({
        ...currentOperation,
        status: 'done',
        completionReason: 'done',
        updatedAt: completedTimestamp,
        completedAt: completedTimestamp
      })
      const sessionAfterAssistant = await this.sessionsRepository.save({
        ...eventScope.session,
        updatedAt: completedTimestamp
      })
      const messages = await this.messagesRepository.listByThread(eventScope.thread.id)

      onEvent?.({
        type: 'operation-done',
        operationId: currentOperation.id,
        session: sessionAfterAssistant,
        topic: eventScope.topic,
        thread: eventScope.thread,
        operation: completedOperation,
        messages
      })

      return {
        session: sessionAfterAssistant,
        topic: eventScope.topic,
        thread: eventScope.thread,
        operation: completedOperation,
        messages
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      const failedTimestamp = createTimestamp()
      const isCancelled = abortController.signal.aborted
      const failedOperation = await this.agentOperationsRepository.save({
        ...currentOperation,
        status: isCancelled ? 'interrupted' : 'error',
        completionReason: isCancelled ? 'interrupted' : 'error',
        error: isCancelled ? null : { message: errorMessage },
        updatedAt: failedTimestamp,
        completedAt: failedTimestamp
      })

      await this.messagesRepository.save({
        ...assistantMessage,
        status: isCancelled ? 'cancelled' : 'error',
        error: isCancelled ? 'Cancelled by user.' : errorMessage,
        updatedAt: failedTimestamp
      })

      onEvent?.({
        type: 'operation-error',
        operationId: currentOperation.id,
        sessionId: eventScope.session.id,
        topicId: eventScope.topic.id,
        threadId: eventScope.thread.id,
        messageId: assistantMessage.id,
        error: isCancelled ? 'Cancelled by user.' : errorMessage,
        operation: failedOperation
      })

      throw error
    } finally {
      this.activeAgentBackends.delete(operation.id)
      this.operationEventListeners.delete(operation.id)
    }
  }

  /**
   * 把统一 agent 事件映射到消息、工具调用和 operation 的持久化状态。
   */
  private async applyAgentEvent({
    event,
    message,
    onEvent,
    operation,
    scope
  }: {
    event: AgentEvent
    message: MessageRecord
    onEvent?: ChatOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
  }): Promise<AgentEventApplicationResult> {
    if (event.type === 'session_id_update') {
      const updatedOperation = await this.agentOperationsRepository.save(
        applyProviderSessionIdToOperation(operation, event.sessionId, createTimestamp())
      )

      return { message, operation: updatedOperation }
    }

    if (event.type === 'usage_update') {
      const updatedOperation = await this.agentOperationsRepository.save(
        applyAgentUsageToOperation(operation, event.usage, createTimestamp())
      )

      return { message, operation: updatedOperation }
    }

    if (event.type === 'complete') {
      if (event.usage === undefined) {
        return { message, operation }
      }

      const updatedOperation = await this.agentOperationsRepository.save(
        applyAgentUsageToOperation(operation, event.usage, createTimestamp())
      )

      return { message, operation: updatedOperation }
    }

    if (event.type === 'status') {
      const updatedOperation = await this.agentOperationsRepository.save(
        applyAgentStatusToOperation(operation, event, createTimestamp())
      )

      return { message, operation: updatedOperation }
    }

    if (event.type === 'info') {
      const updatedOperation = await this.agentOperationsRepository.save(
        applyAgentInfoToOperation(operation, event, createTimestamp())
      )

      return { message, operation: updatedOperation }
    }

    if (event.type === 'text_delta') {
      const updatedMessage = await this.messagesRepository.save({
        ...message,
        content: `${message.content}${event.text}`,
        updatedAt: createTimestamp()
      })

      onEvent?.({
        type: 'message-delta',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        delta: event.text
      })

      return { message: updatedMessage, operation }
    }

    if (event.type === 'text_complete') {
      if (event.text.length === 0 || message.content.length > 0) {
        return { message, operation }
      }

      const updatedMessage = await this.messagesRepository.save({
        ...message,
        content: event.text,
        updatedAt: createTimestamp()
      })

      onEvent?.({
        type: 'message-delta',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        delta: event.text
      })

      return { message: updatedMessage, operation }
    }

    if (event.type === 'reasoning_delta') {
      const updatedMessage = await this.messagesRepository.save({
        ...message,
        reasoning: `${message.reasoning ?? ''}${event.text}`,
        updatedAt: createTimestamp()
      })

      onEvent?.({
        type: 'reasoning-delta',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        delta: event.text
      })

      return { message: updatedMessage, operation }
    }

    if (event.type === 'permission_request') {
      const timestamp = createTimestamp()
      const toolInvocation = await this.toolInvocationsRepository.save({
        id: event.request.requestId,
        toolCallId: event.request.requestId,
        operationId: operation.id,
        messageId: message.id,
        name: event.request.toolName,
        arguments: createPermissionRequestArguments(event.request),
        intervention: {
          type: 'permission_request',
          description: event.request.description,
          ...(event.request.command === undefined ? {} : { command: event.request.command }),
          ...(event.request.reason === undefined ? {} : { reason: event.request.reason }),
          ...(event.request.impact === undefined ? {} : { impact: event.request.impact })
        },
        status: 'waiting_for_human',
        createdAt: timestamp,
        updatedAt: timestamp
      })
      const waitingOperation = await this.agentOperationsRepository.save({
        ...operation,
        status: 'waiting_for_human',
        completionReason: 'waiting_for_human',
        humanInterventions: (operation.humanInterventions ?? 0) + 1,
        updatedAt: timestamp
      })

      this.trackPendingToolPermission(toolInvocation, waitingOperation.id)

      onEvent?.({
        type: 'tool-waiting-approval',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        toolInvocation
      })

      return { message, operation: waitingOperation }
    }

    if (event.type === 'tool_start') {
      const status = event.status === 'waiting_for_human' ? 'waiting_for_human' : 'running'
      const timestamp = createTimestamp()
      let currentOperation = operation
      const toolInvocation = await this.toolInvocationsRepository.save({
        id: event.toolUseId,
        toolCallId: event.toolUseId,
        operationId: operation.id,
        messageId: message.id,
        name: event.toolName,
        arguments: event.input ?? {},
        status,
        createdAt: timestamp,
        updatedAt: timestamp
      })

      if (status === 'waiting_for_human') {
        currentOperation = await this.agentOperationsRepository.save({
          ...operation,
          status: 'waiting_for_human',
          completionReason: 'waiting_for_human',
          humanInterventions: (operation.humanInterventions ?? 0) + 1,
          updatedAt: timestamp
        })
        this.trackPendingToolPermission(toolInvocation, currentOperation.id)
      }

      onEvent?.({
        type: status === 'waiting_for_human' ? 'tool-waiting-approval' : 'tool-start',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        toolInvocation
      })

      return { message, operation: currentOperation }
    }

    if (event.type === 'tool_result') {
      const currentToolInvocation = await this.toolInvocationsRepository.findById(event.toolUseId)
      const timestamp = createTimestamp()
      const toolInvocation = await this.toolInvocationsRepository.save({
        id: event.toolUseId,
        toolCallId: currentToolInvocation?.toolCallId ?? event.toolUseId,
        operationId: operation.id,
        messageId: message.id,
        name: event.toolName ?? currentToolInvocation?.name ?? 'unknown',
        arguments: event.input ?? currentToolInvocation?.arguments ?? {},
        result: event.isError ? null : normalizeToolResult(event.result ?? null),
        error: event.isError ? getErrorMessage(event.result ?? 'Tool call failed.') : null,
        status: event.isError ? 'error' : 'done',
        createdAt: currentToolInvocation?.createdAt ?? timestamp,
        updatedAt: timestamp
      })

      this.pendingToolPermissions.delete(toolInvocation.id)

      onEvent?.({
        type: 'tool-finish',
        operationId: operation.id,
        sessionId: scope.session.id,
        topicId: scope.topic.id,
        threadId: scope.thread.id,
        messageId: message.id,
        toolInvocation
      })

      return { message, operation }
    }

    if (event.type === 'error') {
      throw new Error(event.message)
    }

    if (event.type === 'typed_error') {
      throw new Error(event.error.message)
    }

    return { message, operation }
  }

  /**
   * 解析新消息应使用的 agent target，显式 connection 优先于 provider 和会话默认值。
   */
  private async resolveAgentTarget(input: SendChatMessageInput): Promise<ResolvedAgentTarget> {
    const settings = await this.settingsRepository.getSettings()

    if (input.sessionId !== undefined) {
      const session = await this.sessionsRepository.findById(input.sessionId)

      if (session === null) {
        throw new Error('Chat session not found.')
      }

      if (input.llmConnectionId !== undefined) {
        const inputConnection = await this.resolveInputLlmConnection(input.llmConnectionId)

        return this.createConnectionAgentTarget(
          inputConnection,
          {
            ...session,
            provider: inputConnection.providerId ?? input.provider ?? session.provider,
            llmConnectionId: inputConnection.id
          },
          input.provider ?? session.provider
        )
      }

      if (input.provider !== undefined) {
        const providerConnection = await this.resolveProviderLlmConnection(input.provider)

        if (providerConnection !== null) {
          return this.createConnectionAgentTarget(
            providerConnection,
            {
              ...session,
              provider: input.provider,
              llmConnectionId: providerConnection.id
            },
            input.provider
          )
        }

        return this.createProviderAgentTarget(settings.providers[input.provider], {
          ...session,
          provider: input.provider,
          llmConnectionId: null
        })
      }

      const sessionConnection = await this.resolveSessionLlmConnection(session)

      if (sessionConnection !== null) {
        return this.createConnectionAgentTarget(sessionConnection, session, session.provider)
      }

      return this.createProviderAgentTarget(settings.providers[session.provider], session)
    }

    if (input.llmConnectionId !== undefined) {
      const inputConnection = await this.resolveInputLlmConnection(input.llmConnectionId)

      return this.createConnectionAgentTarget(inputConnection, null, input.provider)
    }

    if (input.provider !== undefined) {
      const providerConnection = await this.resolveProviderLlmConnection(input.provider)

      if (providerConnection !== null) {
        return this.createConnectionAgentTarget(providerConnection, null, input.provider)
      }

      return this.createProviderAgentTarget(settings.providers[input.provider], null)
    }

    return this.resolveDefaultAgentTarget()
  }

  /**
   * 解析默认 agent target，优先使用持久化默认 connection，再回退到旧 provider 设置。
   */
  private async resolveDefaultAgentTarget(): Promise<ResolvedAgentTarget> {
    const connection = await this.settingsRepository.selectDefaultLlmConnection()

    if (connection !== null) {
      return this.createConnectionAgentTarget(connection, null)
    }

    const settings = await this.settingsRepository.getSettings()

    return this.createProviderAgentTarget(selectDefaultChatProvider(settings), null)
  }

  /**
   * 解析 operation 运行时的 agent target，优先使用 operation/session 上记录的 connection。
   */
  private async resolveOperationTarget(
    operation: AgentOperationRecord,
    session: SessionRecord
  ): Promise<ResolvedAgentTarget> {
    const operationConnectionId =
      typeof operation.appContext?.llmConnectionId === 'string'
        ? operation.appContext.llmConnectionId
        : undefined
    const connection =
      operationConnectionId === undefined
        ? await this.resolveSessionLlmConnection(session)
        : await this.settingsRepository.findLlmConnectionById(operationConnectionId)

    if (connection !== null) {
      return this.createConnectionAgentTarget(
        connection,
        session,
        operation.provider ?? session.provider
      )
    }

    const settings = await this.settingsRepository.getSettings()

    return this.createProviderAgentTarget(
      settings.providers[operation.provider ?? session.provider],
      session
    )
  }

  /**
   * 通过 session 记录的 connection id 查找持久化连接，缺失时返回 null 以便回退 provider。
   */
  private async resolveSessionLlmConnection(
    session: SessionRecord
  ): Promise<NormalizedLlmConnection | null> {
    return session.llmConnectionId === undefined || session.llmConnectionId === null
      ? null
      : this.settingsRepository.findLlmConnectionById(session.llmConnectionId)
  }

  /**
   * 解析用户显式指定的 connection，缺失时抛错避免静默切到其它模型。
   */
  private async resolveInputLlmConnection(id: string): Promise<NormalizedLlmConnection> {
    const connection = await this.settingsRepository.findLlmConnectionById(id)

    if (connection === null) {
      throw new Error('LLM connection not found.')
    }

    return connection
  }

  /**
   * 按 provider id 查找同步出来的同名 connection，仅在仍启用且归属匹配时使用。
   */
  private async resolveProviderLlmConnection(
    provider: ProviderId
  ): Promise<NormalizedLlmConnection | null> {
    const connection = await this.settingsRepository.findLlmConnectionById(provider)

    if (connection === null || !connection.enabled) {
      return null
    }

    if (connection.providerId !== undefined && connection.providerId !== provider) {
      return null
    }

    return connection
  }

  /**
   * 基于持久化 LLM connection 创建 agent target，并完成 connection 级可执行校验。
   */
  private createConnectionAgentTarget(
    connection: NormalizedLlmConnection,
    session: SessionRecord | null,
    fallbackProviderId?: ProviderId
  ): ResolvedAgentTarget {
    assertLlmConnectionReadyForAgent(connection)

    return {
      connection,
      persistedLlmConnectionId: connection.id,
      providerId: connection.providerId ?? fallbackProviderId ?? connection.id,
      session
    }
  }

  /**
   * 基于 provider fallback 创建 agent target，并把 provider 设置派生成 connection。
   */
  private async createProviderAgentTarget(
    provider: ProviderSettings | undefined,
    session: SessionRecord | null
  ): Promise<ResolvedAgentTarget> {
    if (provider === undefined) {
      throw new Error('Unknown provider.')
    }

    if (!provider.enabled) {
      throw new Error(`${provider.name} is disabled.`)
    }

    if (!isSupportedChatProvider(provider)) {
      throw new Error(`${provider.name} is not supported for chat.`)
    }

    const providerWithApiKey = await this.withStoredApiKey(provider)

    const model = selectChatModel(providerWithApiKey)

    assertProviderReadyForAgent(providerWithApiKey, model)

    const connection = createProviderLlmConnection(providerWithApiKey, model)

    return {
      connection,
      persistedLlmConnectionId: null,
      providerId: providerWithApiKey.provider,
      session:
        session === null
          ? null
          : {
              ...session,
              provider: providerWithApiKey.provider,
              llmConnectionId: null
            }
    }
  }

  /**
   * 运行历史 operation 时保留 operation 上锁定的模型，同时复用 connection 的凭据和端点。
   */
  private withOperationModel(
    connection: NormalizedLlmConnection,
    operation: AgentOperationRecord
  ): NormalizedLlmConnection {
    return operation.model === null || operation.model === undefined
      ? connection
      : { ...connection, model: operation.model }
  }

  private async resolveConversationScope(
    input: SendChatMessageInput,
    session: SessionRecord | null,
    providerId: ProviderId,
    persistedLlmConnectionId: string | null,
    project: ProjectRecord | null
  ): Promise<ConversationScope> {
    if (session === null) {
      return this.createConversationScope(
        providerId,
        persistedLlmConnectionId,
        createChatTitle(input.content || input.attachments?.[0]?.name || ''),
        project
      )
    }

    const thread =
      input.threadId === undefined
        ? await this.getDefaultThread(session.id)
        : await this.threadsRepository.findById(input.threadId)

    if (thread !== null) {
      const topic = await this.topicsRepository.findById(thread.topicId)

      if (topic === null) {
        throw new Error('Chat topic not found.')
      }

      return { project, session, topic, thread }
    }

    const topic =
      input.topicId === undefined
        ? await this.getDefaultTopic(session.id)
        : await this.topicsRepository.findById(input.topicId)

    if (topic === null) {
      return this.createTopicAndThread(session, defaultTopicTitle, defaultThreadTitle, project)
    }

    return {
      project,
      session,
      topic,
      thread: await this.createThread(topic, defaultThreadTitle)
    }
  }

  /**
   * 从 operation appContext 还原会话作用域，保证恢复运行时仍绑定原项目。
   */
  private async resolveOperationScope(operation: AgentOperationRecord): Promise<ConversationScope> {
    const sessionId =
      typeof operation.appContext?.sessionId === 'string'
        ? operation.appContext.sessionId
        : undefined

    if (sessionId === undefined || operation.topicId == null || operation.threadId == null) {
      throw new Error('Agent operation context is incomplete.')
    }

    const session = await this.sessionsRepository.findById(sessionId)
    const topic = await this.topicsRepository.findById(operation.topicId)
    const thread = await this.threadsRepository.findById(operation.threadId)

    if (session === null || topic === null || thread === null) {
      throw new Error('Agent operation context not found.')
    }

    return { project: await this.resolveSessionProject(session), session, topic, thread }
  }

  /**
   * 创建会话、默认 topic 和默认 thread，并把会话绑定到当前项目。
   */
  private async createConversationScope(
    providerId: ProviderId,
    persistedLlmConnectionId: string | null,
    title: string,
    project: ProjectRecord | null
  ): Promise<ConversationScope> {
    const timestamp = createTimestamp()
    const session = await this.sessionsRepository.save({
      id: randomUUID(),
      llmConnectionId: persistedLlmConnectionId,
      projectId: project?.id ?? null,
      provider: providerId,
      title,
      status: 'active',
      userId: defaultChatUserId,
      createdAt: timestamp,
      updatedAt: timestamp
    })

    return this.createTopicAndThread(session, title, defaultThreadTitle, project)
  }

  /**
   * 为会话创建默认 topic/thread，并沿用调用方解析好的项目上下文。
   */
  private async createTopicAndThread(
    session: SessionRecord,
    topicTitle: string,
    threadTitle: string,
    project: ProjectRecord | null
  ): Promise<ConversationScope> {
    const timestamp = createTimestamp()
    const topic = await this.topicsRepository.save({
      id: randomUUID(),
      sessionId: session.id,
      title: topicTitle,
      userId: defaultChatUserId,
      trigger: 'chat',
      mode: 'default',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const thread = await this.threadsRepository.save({
      id: randomUUID(),
      topicId: topic.id,
      title: threadTitle,
      type: 'standalone',
      status: 'active',
      userId: defaultChatUserId,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })

    return { project, session, topic, thread }
  }

  /**
   * 在现有 topic 下创建新的 continuation thread。
   */
  private async createThread(topic: TopicRecord, title: string): Promise<ThreadRecord> {
    const timestamp = createTimestamp()

    return this.threadsRepository.save({
      id: randomUUID(),
      topicId: topic.id,
      title,
      type: 'continuation',
      status: 'active',
      userId: defaultChatUserId,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  /**
   * 创建 agent operation，并把项目上下文写入 appContext 供恢复和审计使用。
   */
  private async createOperation(
    scope: ConversationScope,
    providerId: ProviderId,
    connection: NormalizedLlmConnection,
    persistedLlmConnectionId: string | null,
    status: AgentOperationRecord['status'] = 'running'
  ): Promise<AgentOperationRecord> {
    const timestamp = createTimestamp()

    return this.agentOperationsRepository.save({
      id: randomUUID(),
      userId: defaultChatUserId,
      topicId: scope.topic.id,
      threadId: scope.thread.id,
      status,
      ...(status === 'running' ? { startedAt: timestamp } : {}),
      model: connection.model,
      provider: providerId,
      trigger: 'chat',
      appContext: {
        sessionId: scope.session.id,
        ...(persistedLlmConnectionId === null ? {} : { llmConnectionId: persistedLlmConnectionId }),
        llmConnectionBackend: connection.backend,
        ...(scope.project === null
          ? {}
          : {
              projectId: scope.project.id,
              projectName: scope.project.name,
              projectPath: scope.project.path
            })
      },
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  /**
   * 读取会话默认 topic，当前策略使用列表首项作为默认值。
   */
  private async getDefaultTopic(sessionId: string): Promise<TopicRecord | null> {
    const topics = await this.topicsRepository.listBySession(sessionId)

    return topics[0] ?? null
  }

  /**
   * 读取会话默认 thread，当前策略使用列表首项作为默认值。
   */
  private async getDefaultThread(sessionId: string): Promise<ThreadRecord | null> {
    const threads = await this.threadsRepository.listBySession(sessionId)

    return threads[0] ?? null
  }

  /**
   * 用户首条消息后按内容刷新新会话标题，已有自定义标题保持不变。
   */
  private async touchSessionWithTitle(
    session: SessionRecord,
    title: string
  ): Promise<SessionRecord> {
    const shouldUpdateTitle = session.title === newChatTitle || session.title === ''

    return this.sessionsRepository.save({
      ...session,
      title: shouldUpdateTitle ? title : session.title,
      updatedAt: createTimestamp()
    })
  }

  /**
   * 用户首条消息后按内容刷新默认 topic 标题。
   */
  private async touchTopicTitle(topic: TopicRecord, title: string): Promise<TopicRecord> {
    const shouldUpdateTitle = topic.title === defaultTopicTitle || topic.title === newChatTitle

    return this.topicsRepository.save({
      ...topic,
      title: shouldUpdateTitle ? title : topic.title,
      updatedAt: createTimestamp()
    })
  }

  /**
   * 用户首条消息后按内容刷新默认 thread 标题并更新时间。
   */
  private async touchThreadTitle(thread: ThreadRecord, title: string): Promise<ThreadRecord> {
    const shouldUpdateTitle = thread.title === defaultThreadTitle || thread.title === newChatTitle
    const timestamp = createTimestamp()

    return this.threadsRepository.save({
      ...thread,
      title: shouldUpdateTitle ? title : thread.title,
      lastActiveAt: timestamp,
      updatedAt: timestamp
    })
  }

  /**
   * 读取持久化 API key 并合并进 provider 设置，避免 renderer 接触密钥。
   */
  private async withStoredApiKey(provider: ProviderSettings): Promise<ProviderSettings> {
    const apiKey = await this.settingsRepository.getProviderApiKey(provider.provider)

    return {
      ...provider,
      apiKey
    }
  }

  /**
   * 解析新消息归属项目；已有 session 优先使用 session 绑定，空输入回退 active project。
   */
  private async resolveInputProject(
    input: Pick<SendChatMessageInput, 'projectId'>,
    session: SessionRecord | null
  ): Promise<ProjectRecord | null> {
    if (session !== null) {
      return this.resolveSessionProject(session)
    }

    if (input.projectId === null) {
      return null
    }

    if (input.projectId !== undefined) {
      return this.resolveProjectById(input.projectId)
    }

    return this.projectsRepository?.getActiveProject() ?? null
  }

  /**
   * 根据 session.projectId 查找项目，null 表示历史未绑定会话。
   */
  private async resolveSessionProject(session: SessionRecord): Promise<ProjectRecord | null> {
    return session.projectId === null ? null : this.resolveProjectById(session.projectId)
  }

  /**
   * 按 id 读取项目，避免输入引用不存在项目时静默降级。
   */
  private async resolveProjectById(projectId: string): Promise<ProjectRecord> {
    if (this.projectsRepository === undefined) {
      throw new Error('Project repository is not available.')
    }

    const project = await this.projectsRepository.findById(projectId)

    if (project === null) {
      throw new Error('Project not found.')
    }

    return project
  }
}
