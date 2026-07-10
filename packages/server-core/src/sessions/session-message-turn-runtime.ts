/**
 * 负责创建聊天消息 turn 的持久化骨架。
 * 它处理 session/topic/thread 分支、idle operation 和 message 创建，不启动 backend 执行。
 */

import { randomUUID } from 'node:crypto'

import type { AgentProviderSessionFork } from '@moon/shared/agent'
import type { NormalizedLlmConnection } from '@moon/shared/config'
import type {
  AgentOperationRecord,
  CreateMessageTurnResult,
  SessionRecord,
  ThreadRecord,
  TopicRecord
} from '@moon/shared/domain/chat'
import { defaultChatUserId } from '@moon/shared/domain/chat'
import type { CreateMessageTurnInput } from '@moon/shared/domain/chat-validation'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type { ProviderId } from '@moon/shared/domain/provider'
import type { SessionAgentTargetResult } from './session-agent-target-runtime'
import type { SessionSourceProviderScope } from './session-agent-runtime'
import { listSessionThreadHistory } from './session-thread-history'
import type {
  AgentOperationsRepositoryPort,
  MessagesRepositoryPort,
  ProjectsRepositoryPort,
  SessionsRepositoryPort,
  ThreadsRepositoryPort,
  TopicsRepositoryPort
} from './session-manager'

const newChatTitle = '新聊天'
const defaultTopicTitle = '默认话题'
const defaultThreadTitle = '主线'
const titleMaxLength = 48

type ConversationScope = SessionSourceProviderScope

export type SessionMessageTurnRuntimeInput = {
  agentOperationsRepository: AgentOperationsRepositoryPort
  messagesRepository: MessagesRepositoryPort
  projectsRepository?: ProjectsRepositoryPort
  sessionsRepository: SessionsRepositoryPort
  threadsRepository: ThreadsRepositoryPort
  topicsRepository: TopicsRepositoryPort
}

export type SessionMessageTurnRuntimeCreateInput = {
  input: CreateMessageTurnInput
  target: SessionAgentTargetResult
}

export type SessionMessageTurnRuntimeCreateSessionInput = {
  target: Pick<SessionAgentTargetResult, 'persistedLlmConnectionId' | 'providerId'>
}

export type SessionMessageTurnRuntimeResult = CreateMessageTurnResult

type SessionThreadBranchInput = {
  parentThreadId: string
  providerSessionFork: AgentProviderSessionFork
  sourceMessageId: string
}

/**
 * 创建当前时间戳，统一消息 turn 落库记录的时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 从 metadata 中读取非空字符串，供 provider session lineage 校验复用。
 */
function readMetadataString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
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
 * 管理消息 turn 创建阶段需要的会话、线程、operation 和消息落库。
 */
export class SessionMessageTurnRuntime {
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly projectsRepository?: ProjectsRepositoryPort
  private readonly sessionsRepository: SessionsRepositoryPort
  private readonly threadsRepository: ThreadsRepositoryPort
  private readonly topicsRepository: TopicsRepositoryPort

  /**
   * 注入 message turn 创建所需的仓储端口。
   */
  constructor({
    agentOperationsRepository,
    messagesRepository,
    projectsRepository,
    sessionsRepository,
    threadsRepository,
    topicsRepository
  }: SessionMessageTurnRuntimeInput) {
    this.agentOperationsRepository = agentOperationsRepository
    this.messagesRepository = messagesRepository
    this.projectsRepository = projectsRepository
    this.sessionsRepository = sessionsRepository
    this.threadsRepository = threadsRepository
    this.topicsRepository = topicsRepository
  }

  /**
   * 创建空聊天会话和默认 topic/thread，供 createSession façade 使用。
   */
  async createSession({
    target
  }: SessionMessageTurnRuntimeCreateSessionInput): Promise<SessionRecord> {
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
   * 创建一次用户消息和待填充助手消息，准备 idle operation 但不启动模型执行。
   */
  async create({
    input,
    target
  }: SessionMessageTurnRuntimeCreateInput): Promise<SessionMessageTurnRuntimeResult> {
    const connection = target.connection
    const persistedLlmConnectionId = target.persistedLlmConnectionId
    const providerId = target.providerId
    const modelId = connection.model
    const project = await this.resolveInputProject(input, target.session)
    const scope = await this.resolveConversationScope(
      input,
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
    const attachments = input.attachments ?? []
    const timestamp = createTimestamp()
    const previousMessages = await listSessionThreadHistory({
      messagesRepository: this.messagesRepository,
      thread: scope.thread,
      threadsRepository: this.threadsRepository
    })
    const parentMessage = [...previousMessages].reverse().find((message) => message.role !== 'tool')
    const userMessage = await this.messagesRepository.save({
      id: randomUUID(),
      sessionId: scope.session.id,
      topicId: scope.topic.id,
      threadId: scope.thread.id,
      ...(parentMessage === undefined ? {} : { parentId: parentMessage.id }),
      operationId: operation.id,
      role: 'user',
      content: input.content,
      status: 'complete',
      provider: providerId,
      model: modelId,
      ...(attachments.length === 0 ? {} : { attachments }),
      createdAt: timestamp,
      updatedAt: timestamp
    })
    const title = createChatTitle(input.content || attachments[0]?.name || '')
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
   * 解析输入对应的会话作用域；新会话会同时创建默认 topic/thread。
   */
  private async resolveConversationScope(
    input: CreateMessageTurnInput,
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

    if (input.parentThreadId !== undefined && input.sourceMessageId !== undefined) {
      return this.createBranchScope(session, input.parentThreadId, input.sourceMessageId, project)
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
   * 从父 thread 的已完成 assistant 消息创建 continuation thread，并保存一次性 provider fork。
   */
  private async createBranchScope(
    session: SessionRecord,
    parentThreadId: string,
    sourceMessageId: string,
    project: ProjectRecord | null
  ): Promise<ConversationScope> {
    const parentThread = await this.threadsRepository.findById(parentThreadId)

    if (parentThread === null) {
      throw new Error('Chat parent thread not found.')
    }

    const topic = await this.topicsRepository.findById(parentThread.topicId)

    if (topic === null || topic.sessionId !== session.id) {
      throw new Error('Chat parent thread does not belong to the session.')
    }

    const parentHistory = await listSessionThreadHistory({
      messagesRepository: this.messagesRepository,
      thread: parentThread,
      threadsRepository: this.threadsRepository
    })
    const sourceMessage = parentHistory.find((message) => message.id === sourceMessageId)

    if (
      sourceMessage === undefined ||
      sourceMessage.threadId !== parentThread.id ||
      sourceMessage.role !== 'assistant' ||
      sourceMessage.status !== 'complete'
    ) {
      throw new Error(
        'Chat branch source must be a completed assistant message in the parent thread.'
      )
    }

    const providerSessionId = readMetadataString(sourceMessage.metadata?.providerSessionId)
    const providerMessageId = readMetadataString(sourceMessage.metadata?.providerMessageId)

    if (providerSessionId === null || providerMessageId === null) {
      throw new Error('Provider branch context is not available for this message.')
    }

    return {
      project,
      session,
      topic,
      thread: await this.createThread(topic, defaultThreadTitle, {
        parentThreadId,
        providerSessionFork: { providerSessionId, providerMessageId },
        sourceMessageId
      })
    }
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
  private async createThread(
    topic: TopicRecord,
    title: string,
    branch?: SessionThreadBranchInput
  ): Promise<ThreadRecord> {
    const timestamp = createTimestamp()

    return this.threadsRepository.save({
      id: randomUUID(),
      topicId: topic.id,
      title,
      type: 'continuation',
      status: 'active',
      ...(branch === undefined
        ? {}
        : {
            parentThreadId: branch.parentThreadId,
            sourceMessageId: branch.sourceMessageId,
            metadata: { providerSessionFork: branch.providerSessionFork }
          }),
      userId: defaultChatUserId,
      lastActiveAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  /**
   * 创建 idle agent operation，并写入后续恢复执行需要的 appContext。
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
        ...(scope.thread.sourceMessageId == null
          ? {}
          : { sourceMessageId: scope.thread.sourceMessageId }),
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
   * 解析新消息归属项目；已有 session 优先使用 session 绑定，空输入回退 active project。
   */
  private async resolveInputProject(
    input: Pick<CreateMessageTurnInput, 'projectId'>,
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
