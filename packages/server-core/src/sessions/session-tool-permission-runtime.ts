/**
 * 负责管理会话层工具权限审批的运行态。
 * 它只保存 pending tool、active backend 和事件监听器，不拥有 operation 主执行循环。
 */

import type { AgentBackend, AgentPermissionDecision } from '@moon/shared/agent'
import type {
  AgentOperationRecord,
  ChatJsonObject,
  ChatOperationEvent,
  ToolInvocationRecord
} from '@moon/shared/domain/chat'
import type { SessionEventRouteHint } from './handlers'
import type {
  AgentOperationsRepositoryPort,
  ToolInvocationsRepositoryPort
} from './session-manager'

type PendingToolPermission = {
  operationId: string
}

type OperationEventListenerRegistration = {
  listener: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
  routeHint?: SessionEventRouteHint
}

export type SessionToolPermissionRuntimeInput = {
  agentOperationsRepository: AgentOperationsRepositoryPort
  toolInvocationsRepository: ToolInvocationsRepositoryPort
}

export type SessionToolPermissionApprovalInput = {
  alwaysAllow?: boolean
  toolInvocationId: string
}

export type SessionToolPermissionRejectionInput = {
  reason?: string
  toolInvocationId: string
}

/**
 * 创建当前时间戳，统一权限审批落库记录的时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
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
 * 管理用户工具审批从 pending 到 backend resume 的运行时状态。
 */
export class SessionToolPermissionRuntime {
  private readonly activeAgentBackends = new Map<string, AgentBackend>()
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly operationEventListeners = new Map<string, OperationEventListenerRegistration>()
  private readonly pendingToolPermissions = new Map<string, PendingToolPermission>()
  private readonly toolInvocationsRepository: ToolInvocationsRepositoryPort

  /**
   * 注入审批运行态需要读取和更新的 operation/tool 仓储。
   */
  constructor({
    agentOperationsRepository,
    toolInvocationsRepository
  }: SessionToolPermissionRuntimeInput) {
    this.agentOperationsRepository = agentOperationsRepository
    this.toolInvocationsRepository = toolInvocationsRepository
  }

  /**
   * 记录某个 operation 当前可回传权限决策的 backend。
   */
  registerBackend(operationId: string, backend: AgentBackend): void {
    this.activeAgentBackends.set(operationId, backend)
  }

  /**
   * 释放 operation 结束后不再可用的 backend。
   */
  releaseBackend(operationId: string): void {
    this.activeAgentBackends.delete(operationId)
  }

  /**
   * 记录 operation 的事件监听器，用于审批完成后 replay tool-finish。
   */
  registerOperationListener(
    operationId: string,
    listener: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void,
    routeHint?: SessionEventRouteHint
  ): void {
    this.operationEventListeners.set(operationId, { listener, routeHint })
  }

  /**
   * 释放 operation 结束后不再可用的事件监听器。
   */
  releaseOperationListener(operationId: string): void {
    this.operationEventListeners.delete(operationId)
  }

  /**
   * 把权限请求记录为待审批状态，供用户操作或取消 operation 时定位。
   */
  trackPendingToolPermission(toolInvocation: ToolInvocationRecord, operationId: string): void {
    this.pendingToolPermissions.set(toolInvocation.id, { operationId })
  }

  /**
   * 清理已完成或已被工具结果覆盖的 pending 权限请求。
   */
  clearPendingToolPermission(toolInvocationId: string): void {
    this.pendingToolPermissions.delete(toolInvocationId)
  }

  /**
   * 批准等待中的工具权限请求，并把允许决策送回对应 backend。
   */
  approve({
    alwaysAllow,
    toolInvocationId
  }: SessionToolPermissionApprovalInput): Promise<ToolInvocationRecord> {
    return this.resolveToolPermissionDecision(toolInvocationId, {
      requestId: toolInvocationId,
      approved: true,
      ...(alwaysAllow === undefined ? {} : { alwaysAllow })
    })
  }

  /**
   * 拒绝等待中的工具权限请求，并把拒绝决策送回对应 backend。
   */
  reject({
    reason,
    toolInvocationId
  }: SessionToolPermissionRejectionInput): Promise<ToolInvocationRecord> {
    return this.resolveToolPermissionDecision(toolInvocationId, {
      requestId: toolInvocationId,
      approved: false,
      reason: resolveRejectedToolReason(reason)
    })
  }

  /**
   * operation 被取消时拒绝所有待处理权限，释放仍在等待用户决策的 backend。
   */
  async rejectPendingForOperation(operationId: string, reason: string): Promise<void> {
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
}
