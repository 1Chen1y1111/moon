/**
 * 负责 Moon 会话运行时的核心编排，承接消息 turn、agent operation 和事件落库。
 * 本文件属于可复用 server-core 边界，只依赖仓储接口，不依赖 Electron、IPC 或 renderer。
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  assertLlmConnectionReadyForAgent,
  assertProviderReadyForAgent,
  addActivatedSourceSlug,
  createBackend,
  createConnectionAgentBackendConfig,
  createAgentSessionRuntimeState,
  createAgentBackendMessage,
  createProviderLlmConnection,
  resolveAgentBackendProvider,
  resolveConnectionAgentBackendProvider,
  hasActivatedSourceSlug,
  type AgentBackend,
  type AgentBackendConfig,
  type AgentBackendMessage,
  type AgentEvent,
  type AgentPermissionMode,
  type AgentPermissionDecision,
  type AgentSessionRuntimeState,
  type AgentSourceRecord
} from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
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
import type { AppSettings, ProviderSettings } from '@moon/shared/domain/settings'
import type { ProviderId } from '@moon/shared/domain/provider'
import type { SessionEventRouteHint } from './handlers'
import { SessionScopedToolCallbackRegistry } from './session-scoped-tool-callback-registry'

const newChatTitle = '新聊天'
const defaultTopicTitle = '默认话题'
const defaultThreadTitle = '主线'
const titleMaxLength = 48
const defaultAgentPermissionMode = 'ask' satisfies AgentPermissionMode

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

/**
 * Source provider 解析 sources 时可见的会话作用域，保持在 server-core 纯 runtime 边界内。
 */
export type SessionSourceProviderScope = {
  project: ProjectRecord | null
  session: SessionRecord
  topic: TopicRecord
  thread: ThreadRecord
}

/**
 * 为当前会话 turn 提供 agent sources，具体来源由 Electron main 或未来 runtime 注入。
 */
export type SessionSourceProvider = {
  resolveSources: (scope: SessionSourceProviderScope) => Promise<AgentSourceRecord[]>
}

/**
 * 为当前会话 turn 解析 agent 权限模式，具体来源可由 Electron main 或未来 runtime 注入。
 */
export type SessionPermissionModeResolver = {
  resolvePermissionMode: (
    scope: SessionSourceProviderScope
  ) => AgentPermissionMode | Promise<AgentPermissionMode>
}

/**
 * 激活当前会话 turn 需要的 source；当前只表达 runtime 边界，不实现具体连接协议。
 */
export type SessionSourceActivator = {
  activateSource: (scope: SessionSourceProviderScope, sourceSlug: string) => Promise<boolean>
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

type AgentInfoPayload = Extract<AgentEvent, { type: 'info' }>
type AgentPermissionPayload = Extract<AgentEvent, { type: 'permission_request' }>
type AgentStatusPayload = Extract<AgentEvent, { type: 'status' }>
type AgentEventUsagePayload = Extract<AgentEvent, { type: 'usage_update' }>['usage']

type AgentEventApplicationResult = {
  message: MessageRecord
  operation: AgentOperationRecord
  sourceActivation?: SourceActivationSignal
}

type PendingToolPermission = {
  operationId: string
}

type SourceActivationSignal = {
  originalMessage?: string
  sourceSlug: string
}

type OperationEventListenerRegistration = {
  listener: SessionOperationEventListener
  routeHint?: SessionEventRouteHint
}

type ResolvedAgentTarget = {
  connection: NormalizedLlmConnection
  persistedLlmConnectionId: string | null
  providerId: ProviderId
  session: SessionRecord | null
}

type ConversationScope = SessionSourceProviderScope

export type AgentBackendFactory = (config: AgentBackendConfig) => AgentBackend

/**
 * 创建当前时间戳，统一聊天落库记录的时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 将当前 thread session 记住的 source activation 应用到 provider 返回的 source 列表。
 * 这里不创建未知 source，只把已知 slug 标记为 active，避免提前引入完整 MCP source registry。
 */
function applySessionActivatedSources(
  sources: AgentSourceRecord[],
  agentSessionState: AgentSessionRuntimeState
): AgentSourceRecord[] {
  if (agentSessionState.activatedSourceSlugs.length === 0) {
    return sources
  }

  return sources.map((source) => {
    if (!hasActivatedSourceSlug(agentSessionState.activatedSourceSlugs, source.slug)) {
      return source
    }

    const activatedSource: AgentSourceRecord = {
      ...source,
      status: 'active'
    }

    delete activatedSource.error

    return activatedSource
  })
}

/**
 * 根据会话记录生成内部事件路由提示。
 * 这里不改变对 renderer 广播的事件 payload。
 */
function createSessionEventRouteHint(session: SessionRecord): SessionEventRouteHint {
  return { workspaceId: session.projectId }
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
    ...(request.path === undefined ? {} : { path: request.path }),
    ...(request.type === undefined ? {} : { type: request.type }),
    ...(request.reason === undefined ? {} : { reason: request.reason }),
    ...(request.impact === undefined ? {} : { impact: request.impact })
  }
}

/**
 * 生成保留 agent turn id 的 message metadata patch；没有 turn id 时保持旧记录形状。
 */
function createAgentTurnMessageMetadataPatch(
  metadata: ChatJsonObject | undefined,
  turnId?: string
): Pick<MessageRecord, 'metadata'> | Record<string, never> {
  return turnId === undefined
    ? {}
    : {
        metadata: {
          ...(metadata ?? {}),
          agentTurnId: turnId
        }
      }
}

/**
 * 生成保留 agent turn id 的 tool state patch；没有 turn id 时不写空 state。
 */
function createAgentTurnToolStatePatch(
  state: ChatJsonObject | null | undefined,
  turnId?: string
): Pick<ToolInvocationRecord, 'state'> | Record<string, never> {
  const nextState =
    turnId === undefined ? (state ?? undefined) : { ...(state ?? {}), agentTurnId: turnId }

  return nextState === undefined ? {} : { state: nextState }
}

/**
 * 从工具状态中读取 agent turn id，用于权限恢复这类非 AgentEvent 直接触发的广播。
 */
function readAgentTurnIdFromToolState(
  state: ChatJsonObject | null | undefined
): string | undefined {
  const turnId = state?.agentTurnId

  return typeof turnId === 'string' && turnId.length > 0 ? turnId : undefined
}

/**
 * 为拒绝类工具决策生成统一文案，避免 renderer 和 main 对默认文案各自发散。
 */
function resolveRejectedToolReason(reason?: string): string {
  return reason?.trim() || 'Rejected by user.'
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
export class SessionManager {
  private readonly activeAgentBackends = new Map<string, AgentBackend>()
  private readonly activeOperations = new Map<string, AbortController>()
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly attachmentsDirectory: string
  private readonly createAgentBackend: AgentBackendFactory
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly operationEventListeners = new Map<string, OperationEventListenerRegistration>()
  private readonly pendingToolPermissions = new Map<string, PendingToolPermission>()
  private readonly permissionModeResolver?: SessionPermissionModeResolver
  private readonly projectsRepository?: ProjectsRepositoryPort
  private readonly agentSessionRuntimeStates = new Map<string, AgentSessionRuntimeState>()
  private readonly sessionsRepository: SessionsRepositoryPort
  private readonly sessionScopedToolCallbacks = new SessionScopedToolCallbackRegistry()
  private readonly settingsRepository: SettingsRepositoryPort
  private readonly sourceActivator?: SessionSourceActivator
  private readonly sourceProvider?: SessionSourceProvider
  private readonly threadsRepository: ThreadsRepositoryPort
  private readonly toolInvocationsRepository: ToolInvocationsRepositoryPort
  private readonly topicsRepository: TopicsRepositoryPort

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
    this.agentOperationsRepository = agentOperationsRepository
    this.createAgentBackend =
      createAgentBackend ?? ((config) => agentBackend ?? createBackend(config))
    this.attachmentsDirectory = attachmentsDirectory ?? join(process.cwd(), '.moon-attachments')
    this.messagesRepository = messagesRepository
    this.permissionModeResolver = permissionModeResolver
    this.projectsRepository = projectsRepository
    this.sessionsRepository = sessionsRepository
    this.settingsRepository = settingsRepository
    this.sourceActivator = sourceActivator
    this.sourceProvider = sourceProvider
    this.threadsRepository = threadsRepository
    this.toolInvocationsRepository = toolInvocationsRepository
    this.topicsRepository = topicsRepository
  }

  /**
   * 返回指定 thread 的内存态 agent session runtime state；同一 thread 后续 operation 复用。
   */
  private resolveAgentSessionRuntimeState(threadId: string): AgentSessionRuntimeState {
    const existing = this.agentSessionRuntimeStates.get(threadId)

    if (existing !== undefined) {
      return existing
    }

    const state = createAgentSessionRuntimeState()

    this.agentSessionRuntimeStates.set(threadId, state)

    return state
  }

  /**
   * 解析当前会话 turn 使用的 agent 权限模式；未注入 resolver 时保持默认 ask 语义。
   */
  private async resolvePermissionModeForScope(
    scope: ConversationScope
  ): Promise<AgentPermissionMode> {
    if (this.permissionModeResolver === undefined) {
      return defaultAgentPermissionMode
    }

    return this.permissionModeResolver.resolvePermissionMode(scope)
  }

  /**
   * 列出当前 runtime 可见的聊天会话。
   */
  listSessions(): Promise<SessionRecord[]> {
    return this.sessionsRepository.list()
  }

  /**
   * 按会话读取话题列表，调用边界止于仓储查询。
   */
  async listTopics(input: ListChatTopicsInput): Promise<TopicRecord[]> {
    const parsedInput = listChatTopicsInputSchema.parse(input)

    return this.topicsRepository.listBySession(parsedInput.sessionId)
  }

  /**
   * 按话题读取线程列表，用于 renderer 展示当前会话分支。
   */
  async listThreads(input: ListChatThreadsInput): Promise<ThreadRecord[]> {
    const parsedInput = listChatThreadsInputSchema.parse(input)

    return this.threadsRepository.listByTopic(parsedInput.topicId)
  }

  /**
   * 读取指定线程消息；未传 threadId 时回退到会话默认线程。
   */
  async getMessages(input: GetChatMessagesInput): Promise<MessageRecord[]> {
    const parsedInput = getChatMessagesInputSchema.parse(input)

    if (parsedInput.threadId !== undefined) {
      return this.messagesRepository.listByThread(parsedInput.threadId)
    }

    const thread = await this.getDefaultThread(parsedInput.sessionId)

    return thread === null ? [] : this.messagesRepository.listByThread(thread.id)
  }

  /**
   * 创建空聊天会话，并绑定当前默认 provider/connection 与 active project。
   */
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

  /**
   * 删除指定会话；当前 runtime 不额外清理附件目录。
   */
  async deleteSession(input: DeleteChatSessionInput): Promise<void> {
    const parsedInput = deleteChatSessionInputSchema.parse(input)

    await this.sessionsRepository.deleteById(parsedInput.sessionId)
  }

  /**
   * 把 renderer 传入的附件写入 runtime 附件目录，并返回聊天域附件记录。
   */
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

  /**
   * 创建一次用户消息和待填充助手消息，准备 operation 但不启动模型执行。
   */
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

  /**
   * 执行已创建的 operation，消费 AgentEvent 并持续更新消息、工具和 operation 状态。
   */
  async runOperation(
    input: RunChatOperationInput,
    onEvent?: SessionOperationEventListener
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
    const eventRouteHint = createSessionEventRouteHint(scope.session)

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

    onEvent?.(
      {
        type: 'operation-started',
        operationId: runningOperation.id,
        operation: runningOperation
      },
      eventRouteHint
    )

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

  /**
   * 组合创建 turn 与执行 operation，维持旧 `sendMessage` 的单调用语义。
   */
  async sendMessage(
    input: SendChatMessageInput,
    onEvent?: SessionOperationEventListener
  ): Promise<SendMessageResult> {
    const parsedInput = sendChatMessageInputSchema.parse(input)
    const turn = await this.createMessageTurn(parsedInput)
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

    if (operation.status === 'done') {
      return operation
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
    const listenerRegistration = this.operationEventListeners.get(operation.id)
    const sessionId =
      typeof operation.appContext?.sessionId === 'string' ? operation.appContext.sessionId : null

    if (
      listenerRegistration === undefined ||
      sessionId === null ||
      operation.topicId == null ||
      operation.threadId == null
    ) {
      return
    }

    const turnId = readAgentTurnIdFromToolState(toolInvocation.state)

    listenerRegistration.listener(
      {
        type: 'tool-finish',
        operationId: operation.id,
        sessionId,
        topicId: operation.topicId,
        threadId: operation.threadId,
        messageId: toolInvocation.messageId,
        toolInvocation,
        ...(turnId === undefined ? {} : { turnId })
      },
      listenerRegistration.routeHint
    )
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
    onEvent?: SessionOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
  }): Promise<SendMessageResult> {
    const eventScope = {
      project: scope.project,
      session: scope.session,
      topic: scope.topic,
      thread: scope.thread
    }
    const eventRouteHint = createSessionEventRouteHint(eventScope.session)
    let assistantMessage = initialAssistantMessage
    let currentOperation = operation
    let sourceActivationSignal: SourceActivationSignal | null = null

    // 拿出当前 thread 里的历史消息
    const previousMessages = await this.messagesRepository.listByThread(scope.thread.id)

    // 转成 agent backend 格式
    const backendMessages = (
      await Promise.all(
        previousMessages
          .filter((message) => message.id !== assistantMessage.id)
          .map((message) => toAgentBackendMessage(message, this.attachmentsDirectory))
      )
    ).filter((message): message is AgentBackendMessage => message !== null)

    // 从后往前找最近一条 user 消息，把它作为这次要问 agent 的内容
    const currentUserMessage =
      [...previousMessages].reverse().find((message) => message.role === 'user')?.content ?? ''

    // 如果这次会话绑定了项目，就把项目名和路径交给 agent
    const workspace =
      scope.project === null
        ? undefined
        : {
            name: scope.project.name,
            path: scope.project.path
          }

    const agentSessionState = this.resolveAgentSessionRuntimeState(scope.thread.id)
    const permissionMode = await this.resolvePermissionModeForScope(scope)
    // 取出这次会话可用的上下文来源 比如项目/技能/上下文材料
    const sources = await this.resolveSourcesForScope(scope, agentSessionState)

    // 创建 agentBackend
    const agentBackend = this.createAgentBackend(
      // 把 connection、历史消息、workspace、权限模式、sources 整理成 agent 配置
      createConnectionAgentBackendConfig({
        agentSessionState,
        connection,
        messages: backendMessages,
        permissionMode,
        sources,
        workspace
      })
    )

    this.configureSessionScopedToolCallbacks(agentBackend, eventScope, currentUserMessage)
    this.activeAgentBackends.set(operation.id, agentBackend)

    if (onEvent !== undefined) {
      this.operationEventListeners.set(operation.id, {
        listener: onEvent,
        routeHint: eventRouteHint
      })
    }

    try {
      const agentEvents = agentBackend.chat(currentUserMessage, undefined, {
        abortSignal: abortController.signal,
        turnId: operation.id
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
        sourceActivationSignal ??= eventResult.sourceActivation ?? null
        agentEventResult = await agentEvents.next()
      }

      const completedTimestamp = createTimestamp()

      if (
        sourceActivationSignal === null &&
        assistantMessage.content.trim().length === 0 &&
        !assistantMessage.reasoning
      ) {
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

      onEvent?.(
        {
          type: 'operation-done',
          operationId: currentOperation.id,
          session: sessionAfterAssistant,
          topic: eventScope.topic,
          thread: eventScope.thread,
          operation: completedOperation,
          messages
        },
        eventRouteHint
      )

      await this.runSourceActivationAutoRetry({
        onEvent,
        operation: completedOperation,
        scope: eventScope,
        signal: sourceActivationSignal
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

      onEvent?.(
        {
          type: 'operation-error',
          operationId: currentOperation.id,
          sessionId: eventScope.session.id,
          topicId: eventScope.topic.id,
          threadId: eventScope.thread.id,
          messageId: assistantMessage.id,
          error: isCancelled ? 'Cancelled by user.' : errorMessage,
          operation: failedOperation
        },
        eventRouteHint
      )

      throw error
    } finally {
      this.activeAgentBackends.delete(operation.id)
      this.operationEventListeners.delete(operation.id)
      this.sessionScopedToolCallbacks.unregister(eventScope.session.id)
    }
  }

  /**
   * 注册当前会话的 session-scoped tool 回调，并给 backend 注入 source activation 请求桥。
   */
  private configureSessionScopedToolCallbacks(
    agentBackend: AgentBackend,
    scope: ConversationScope,
    originalMessage: string
  ): void {
    const sessionId = scope.session.id
    const agentSessionState = this.resolveAgentSessionRuntimeState(scope.thread.id)

    this.sessionScopedToolCallbacks.register(sessionId, {
      activateSourceInSessionFn: async (sourceSlug: string): Promise<boolean> => {
        if (
          this.sourceActivator === undefined ||
          agentBackend.setPendingSourceActivationRestart === undefined
        ) {
          return false
        }

        const activated = await this.sourceActivator.activateSource(scope, sourceSlug)

        if (!activated) {
          return false
        }

        addActivatedSourceSlug(agentSessionState, sourceSlug)

        agentBackend.setPendingSourceActivationRestart({
          sourceSlug,
          originalMessage
        })

        return true
      }
    })

    agentBackend.onSourceActivationRequest = async (sourceSlug: string): Promise<boolean> => {
      const activateSourceInSessionFn =
        this.sessionScopedToolCallbacks.get(sessionId)?.activateSourceInSessionFn

      return activateSourceInSessionFn?.(sourceSlug) ?? false
    }
  }

  /**
   * source_activated 结束当前 turn 后，复用原始用户消息自动创建下一轮重发消息。
   */
  private async runSourceActivationAutoRetry({
    onEvent,
    operation,
    scope,
    signal
  }: {
    onEvent?: SessionOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
    signal: SourceActivationSignal | null
  }): Promise<void> {
    const originalMessage = signal?.originalMessage

    if (signal === null || originalMessage === undefined || originalMessage.trim().length === 0) {
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
    onEvent?: SessionOperationEventListener
    operation: AgentOperationRecord
    scope: ConversationScope
  }): Promise<AgentEventApplicationResult> {
    const eventRouteHint = createSessionEventRouteHint(scope.session)

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

    if (event.type === 'source_activated') {
      addActivatedSourceSlug(
        this.resolveAgentSessionRuntimeState(scope.thread.id),
        event.sourceSlug
      )

      onEvent?.(
        {
          type: 'source-activated',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          sourceSlug: event.sourceSlug,
          ...(event.originalMessage === undefined
            ? {}
            : { originalMessage: event.originalMessage }),
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

      return {
        message,
        operation,
        sourceActivation: {
          sourceSlug: event.sourceSlug,
          ...(event.originalMessage === undefined ? {} : { originalMessage: event.originalMessage })
        }
      }
    }

    if (event.type === 'text_delta') {
      const updatedMessage = await this.messagesRepository.save({
        ...message,
        content: `${message.content}${event.text}`,
        ...createAgentTurnMessageMetadataPatch(message.metadata, event.turnId),
        updatedAt: createTimestamp()
      })

      onEvent?.(
        {
          type: 'message-delta',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          delta: event.text,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

      return { message: updatedMessage, operation }
    }

    if (event.type === 'text_complete') {
      if (event.text.length === 0 || message.content.length > 0) {
        return { message, operation }
      }

      const updatedMessage = await this.messagesRepository.save({
        ...message,
        content: event.text,
        ...createAgentTurnMessageMetadataPatch(message.metadata, event.turnId),
        updatedAt: createTimestamp()
      })

      onEvent?.(
        {
          type: 'message-delta',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          delta: event.text,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

      return { message: updatedMessage, operation }
    }

    if (event.type === 'reasoning_delta') {
      const updatedMessage = await this.messagesRepository.save({
        ...message,
        reasoning: `${message.reasoning ?? ''}${event.text}`,
        ...createAgentTurnMessageMetadataPatch(message.metadata, event.turnId),
        updatedAt: createTimestamp()
      })

      onEvent?.(
        {
          type: 'reasoning-delta',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          delta: event.text,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

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
          ...(event.request.path === undefined ? {} : { path: event.request.path }),
          ...(event.request.reason === undefined ? {} : { reason: event.request.reason }),
          ...(event.request.impact === undefined ? {} : { impact: event.request.impact })
        },
        ...createAgentTurnToolStatePatch(undefined, event.turnId),
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

      onEvent?.(
        {
          type: 'tool-waiting-approval',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          toolInvocation,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

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
        ...createAgentTurnToolStatePatch(undefined, event.turnId),
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

      onEvent?.(
        {
          type: status === 'waiting_for_human' ? 'tool-waiting-approval' : 'tool-start',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          toolInvocation,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

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
        ...createAgentTurnToolStatePatch(currentToolInvocation?.state, event.turnId),
        status: event.isError ? 'error' : 'done',
        createdAt: currentToolInvocation?.createdAt ?? timestamp,
        updatedAt: timestamp
      })

      this.pendingToolPermissions.delete(toolInvocation.id)

      onEvent?.(
        {
          type: 'tool-finish',
          operationId: operation.id,
          sessionId: scope.session.id,
          topicId: scope.topic.id,
          threadId: scope.thread.id,
          messageId: message.id,
          toolInvocation,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId })
        },
        eventRouteHint
      )

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
   * 从可选 source provider 读取当前会话可见的 sources；空列表不写入 backend config。
   */
  private async resolveSourcesForScope(
    scope: ConversationScope,
    agentSessionState: AgentSessionRuntimeState
  ): Promise<AgentSourceRecord[] | undefined> {
    if (this.sourceProvider === undefined) {
      return undefined
    }

    const sources = await this.sourceProvider.resolveSources(scope)
    const resolvedSources = applySessionActivatedSources(sources, agentSessionState)

    return resolvedSources.length === 0 ? undefined : resolvedSources
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
   * 对 provider 派生连接使用最新 provider 设置生成运行时连接，避免旧连接协议滞留。
   * 旧数据可能没有 providerId，此时借助会话或输入 provider 归属兜底识别。
   */
  private async refreshProviderBackedConnection(
    connection: NormalizedLlmConnection,
    fallbackProviderId?: ProviderId
  ): Promise<NormalizedLlmConnection> {
    const currentBackend = resolveConnectionAgentBackendProvider(connection)

    if (currentBackend === 'pi' || currentBackend === 'pi_compat') {
      return connection
    }

    const settings = await this.settingsRepository.getSettings()
    const providerId =
      connection.providerId ??
      (settings.providers[connection.id] === undefined ? fallbackProviderId : connection.id)

    if (providerId === undefined) {
      return connection
    }

    const provider = settings.providers[providerId]

    if (provider === undefined || !provider.enabled || !isSupportedChatProvider(provider)) {
      return connection
    }

    const storedProvider = await this.withStoredApiKey(provider)
    const providerWithApiKey = storedProvider.apiKey.trim()
      ? storedProvider
      : {
          ...storedProvider,
          apiKey: connection.apiKey ?? ''
        }
    const model = selectChatModel(providerWithApiKey)

    try {
      assertProviderReadyForAgent(providerWithApiKey, model)
    } catch {
      return connection
    }

    const providerConnection = createProviderLlmConnection(providerWithApiKey, model)
    const providerBackend = resolveConnectionAgentBackendProvider(providerConnection)

    if (currentBackend === providerBackend) {
      return connection
    }

    return {
      ...providerConnection,
      id: connection.id,
      enabled: connection.enabled,
      isDefault: connection.isDefault,
      thinkingLevel: connection.thinkingLevel,
      providerId: connection.providerId ?? providerConnection.providerId
    }
  }

  /**
   * 基于持久化 LLM connection 创建 agent target，并完成 connection 级可执行校验。
   */
  private async createConnectionAgentTarget(
    connection: NormalizedLlmConnection,
    session: SessionRecord | null,
    fallbackProviderId?: ProviderId
  ): Promise<ResolvedAgentTarget> {
    const runtimeConnection = await this.refreshProviderBackedConnection(
      connection,
      fallbackProviderId
    )

    assertLlmConnectionReadyForAgent(runtimeConnection)

    return {
      connection: runtimeConnection,
      persistedLlmConnectionId: connection.id,
      providerId: runtimeConnection.providerId ?? fallbackProviderId ?? runtimeConnection.id,
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

    const providerWithApiKey = await this.withStoredApiKey(provider)
    const model = selectChatModel(providerWithApiKey)

    if (!isSupportedChatProvider(providerWithApiKey)) {
      const backend = resolveAgentBackendProvider(providerWithApiKey, model)

      if (backend === 'pi' || backend === 'pi_compat') {
        assertProviderReadyForAgent(providerWithApiKey, model)
      }

      throw new Error(`${provider.name} is not supported for chat.`)
    }

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
