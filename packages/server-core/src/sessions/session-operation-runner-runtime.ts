/**
 * 负责编排已持久化 operation 的外层运行流程。
 * 它只恢复会话 scope、解析 target、串联 lifecycle/execute/retry，不处理 backend 事件细节。
 */

import type {
  AgentOperationRecord,
  ChatOperationEvent,
  RunChatOperationResult,
  SessionRecord
} from '@moon/shared/domain/chat'
import type { ProjectRecord } from '@moon/shared/domain/project'
import type { SessionEventRouteHint } from './handlers'
import type { SessionAgentTargetRuntime } from './session-agent-target-runtime'
import type { SessionSourceProviderScope } from './session-agent-runtime'
import type { SessionOperationLifecycleRuntime } from './session-operation-lifecycle-runtime'
import type { SessionOperationRuntime } from './session-operation-runtime'
import type { SessionSourceActivationRetryRuntime } from './session-source-activation-retry-runtime'
import type {
  AgentOperationsRepositoryPort,
  MessagesRepositoryPort,
  ProjectsRepositoryPort,
  SessionsRepositoryPort,
  ThreadsRepositoryPort,
  TopicsRepositoryPort
} from './session-manager'

type ConversationScope = SessionSourceProviderScope

export type SessionOperationRunnerRuntimeInput = {
  agentOperationsRepository: AgentOperationsRepositoryPort
  agentTargetRuntime: SessionAgentTargetRuntime
  messagesRepository: MessagesRepositoryPort
  operationLifecycleRuntime: SessionOperationLifecycleRuntime
  operationRuntime: SessionOperationRuntime
  projectsRepository?: ProjectsRepositoryPort
  sessionsRepository: SessionsRepositoryPort
  sourceActivationRetryRuntime: SessionSourceActivationRetryRuntime
  threadsRepository: ThreadsRepositoryPort
  topicsRepository: TopicsRepositoryPort
}

export type SessionOperationRunnerRuntimeRunInput = {
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
  operationId: string
}

/**
 * 根据会话记录生成内部事件路由提示。
 * 这里不改变对 renderer 广播的事件 payload。
 */
function createSessionEventRouteHint(session: SessionRecord): SessionEventRouteHint {
  return { workspaceId: session.projectId }
}

/**
 * 编排 runOperation 的恢复、启动、执行、重试和 lifecycle 释放。
 */
export class SessionOperationRunnerRuntime {
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly agentTargetRuntime: SessionAgentTargetRuntime
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly operationLifecycleRuntime: SessionOperationLifecycleRuntime
  private readonly operationRuntime: SessionOperationRuntime
  private readonly projectsRepository?: ProjectsRepositoryPort
  private readonly sessionsRepository: SessionsRepositoryPort
  private readonly sourceActivationRetryRuntime: SessionSourceActivationRetryRuntime
  private readonly threadsRepository: ThreadsRepositoryPort
  private readonly topicsRepository: TopicsRepositoryPort

  /**
   * 注入 runOperation 外层编排所需的仓储和 runtime 协作者。
   */
  constructor({
    agentOperationsRepository,
    agentTargetRuntime,
    messagesRepository,
    operationLifecycleRuntime,
    operationRuntime,
    projectsRepository,
    sessionsRepository,
    sourceActivationRetryRuntime,
    threadsRepository,
    topicsRepository
  }: SessionOperationRunnerRuntimeInput) {
    this.agentOperationsRepository = agentOperationsRepository
    this.agentTargetRuntime = agentTargetRuntime
    this.messagesRepository = messagesRepository
    this.operationLifecycleRuntime = operationLifecycleRuntime
    this.operationRuntime = operationRuntime
    this.projectsRepository = projectsRepository
    this.sessionsRepository = sessionsRepository
    this.sourceActivationRetryRuntime = sourceActivationRetryRuntime
    this.threadsRepository = threadsRepository
    this.topicsRepository = topicsRepository
  }

  /**
   * 运行已创建的 operation，并返回 renderer 需要的 operation/messages 结果。
   */
  async run({
    onEvent,
    operationId
  }: SessionOperationRunnerRuntimeRunInput): Promise<RunChatOperationResult> {
    const operation = await this.agentOperationsRepository.findById(operationId)

    if (operation === null) {
      throw new Error('Agent operation not found.')
    }

    const scope = await this.resolveOperationScope(operation)
    const target = await this.agentTargetRuntime.resolveOperationTarget({
      operation,
      session: scope.session
    })
    const connection = target.connection
    const operationMessages = await this.messagesRepository.listByOperation(operation.id)
    const userMessage = operationMessages.find((message) => message.role === 'user')
    const assistantMessage = operationMessages.find((message) => message.role === 'assistant')
    const eventRouteHint = createSessionEventRouteHint(scope.session)

    if (userMessage === undefined || assistantMessage === undefined) {
      throw new Error('Agent operation messages not found.')
    }

    const lifecycle = await this.operationLifecycleRuntime.start({
      assistantMessage,
      onEvent,
      operation,
      routeHint: eventRouteHint
    })

    try {
      const result = await this.operationRuntime.execute({
        abortSignal: lifecycle.abortSignal,
        assistantMessage: lifecycle.assistantMessage,
        connection,
        onEvent,
        operation: lifecycle.operation,
        routeHint: eventRouteHint,
        scope
      })

      await this.sourceActivationRetryRuntime.run({
        onEvent,
        operation: result.operation,
        scope,
        sourceActivation: result.sourceActivation
      })

      return {
        operation: result.operation,
        messages: result.messages
      }
    } finally {
      this.operationLifecycleRuntime.release(lifecycle.operation.id)
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
   * 根据 session.projectId 查找项目，null 表示历史未绑定会话。
   */
  private async resolveSessionProject(session: SessionRecord): Promise<ProjectRecord | null> {
    return session.projectId === null ? null : this.resolveProjectById(session.projectId)
  }

  /**
   * 按 id 读取项目，避免历史 operation 引用不存在项目时静默降级。
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
