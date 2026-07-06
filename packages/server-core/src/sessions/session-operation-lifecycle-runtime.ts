/**
 * 负责管理单次 operation 的启动、取消和 active abort controller 生命周期。
 * 它不执行 agent backend，也不处理 backend 事件落库。
 */

import type {
  AgentOperationRecord,
  ChatOperationEvent,
  MessageRecord
} from '@moon/shared/domain/chat'
import type { SessionEventRouteHint } from './handlers'
import type {
  AgentOperationsRepositoryPort,
  MessagesRepositoryPort
} from './session-manager'
import type { SessionToolPermissionRuntime } from './session-tool-permission-runtime'

export type SessionOperationLifecycleRuntimeInput = {
  agentOperationsRepository: AgentOperationsRepositoryPort
  messagesRepository: MessagesRepositoryPort
  toolPermissionRuntime: SessionToolPermissionRuntime
}

export type SessionOperationLifecycleStartInput = {
  assistantMessage: MessageRecord
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
  operation: AgentOperationRecord
  routeHint?: SessionEventRouteHint
}

export type SessionOperationLifecycleStartResult = {
  abortSignal: AbortSignal
  assistantMessage: MessageRecord
  operation: AgentOperationRecord
}

export type SessionOperationLifecycleCancelInput = {
  operationId: string
}

/**
 * 创建当前时间戳，统一 operation 生命周期落库记录的时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 管理 operation 从 idle 到 running，以及用户取消时的 interrupted 收尾。
 */
export class SessionOperationLifecycleRuntime {
  private readonly activeOperations = new Map<string, AbortController>()
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly toolPermissionRuntime: SessionToolPermissionRuntime

  /**
   * 注入 operation lifecycle 需要更新的 operation/message 仓储和权限运行态。
   */
  constructor({
    agentOperationsRepository,
    messagesRepository,
    toolPermissionRuntime
  }: SessionOperationLifecycleRuntimeInput) {
    this.agentOperationsRepository = agentOperationsRepository
    this.messagesRepository = messagesRepository
    this.toolPermissionRuntime = toolPermissionRuntime
  }

  /**
   * 启动 operation，创建 abort signal，并广播 operation-started。
   */
  async start({
    assistantMessage,
    onEvent,
    operation,
    routeHint
  }: SessionOperationLifecycleStartInput): Promise<SessionOperationLifecycleStartResult> {
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
      routeHint
    )

    this.activeOperations.set(runningOperation.id, abortController)

    return {
      abortSignal: abortController.signal,
      assistantMessage: streamingAssistantMessage,
      operation: runningOperation
    }
  }

  /**
   * operation 执行结束后释放 active abort controller，重复释放保持无害。
   */
  release(operationId: string): void {
    this.activeOperations.delete(operationId)
  }

  /**
   * 取消 operation，并拒绝该 operation 下仍在等待的工具权限请求。
   */
  async cancel({
    operationId
  }: SessionOperationLifecycleCancelInput): Promise<AgentOperationRecord> {
    const abortController = this.activeOperations.get(operationId)
    const timestamp = createTimestamp()

    abortController?.abort('cancelled')

    const operation = await this.agentOperationsRepository.findById(operationId)

    if (operation === null) {
      throw new Error('Agent operation not found.')
    }

    if (operation.status === 'done') {
      return operation
    }

    await this.toolPermissionRuntime.rejectPendingForOperation(operation.id, 'Cancelled by user.')

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
}
