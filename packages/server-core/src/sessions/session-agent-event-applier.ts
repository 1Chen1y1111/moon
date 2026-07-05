/**
 * 负责把 backend AgentEvent 应用到会话持久化状态和 renderer 事件。
 * 它不拥有 operation 生命周期、权限审批恢复或 backend runtime，只处理单个事件的落库与广播。
 */

import type {
  AgentOperationRecord,
  ChatJsonObject,
  ChatOperationEvent,
  MessageRecord,
  ToolInvocationRecord
} from '@moon/shared/domain/chat'
import type { AgentEvent } from '@moon/shared/agent'
import type { SessionEventRouteHint } from './handlers'
import type {
  AgentOperationsRepositoryPort,
  MessagesRepositoryPort,
  ToolInvocationsRepositoryPort
} from './session-manager'
import type { SessionSourceProviderScope } from './session-agent-runtime'

type AgentInfoPayload = Extract<AgentEvent, { type: 'info' }>
type AgentPermissionPayload = Extract<AgentEvent, { type: 'permission_request' }>
type AgentStatusPayload = Extract<AgentEvent, { type: 'status' }>
type AgentEventUsagePayload = Extract<AgentEvent, { type: 'usage_update' }>['usage']

/**
 * 表示 source 激活后需要在 operation 完成阶段触发自动重试的最小信号。
 */
export type SessionSourceActivationSignal = {
  originalMessage?: string
  sourceSlug: string
}

/**
 * 单个 AgentEvent 应用后的会话状态快照，供 SessionManager 继续下一轮事件处理。
 */
export type SessionAgentEventApplicationResult = {
  message: MessageRecord
  operation: AgentOperationRecord
  sourceActivation?: SessionSourceActivationSignal
}

/**
 * 构造 event applier 所需的持久化端口和会话侧回调。
 */
export type SessionAgentEventApplierInput = {
  agentOperationsRepository: AgentOperationsRepositoryPort
  clearPendingToolPermission: (toolInvocationId: string) => void
  messagesRepository: MessagesRepositoryPort
  recordActivatedSource: (threadId: string, sourceSlug: string) => void
  toolInvocationsRepository: ToolInvocationsRepositoryPort
  trackPendingToolPermission: (
    toolInvocation: ToolInvocationRecord,
    operationId: string
  ) => void
}

/**
 * 应用单个 AgentEvent 时需要的当前 operation/message 快照和事件出口。
 */
export type SessionAgentEventApplyInput = {
  event: AgentEvent
  message: MessageRecord
  onEvent?: (event: ChatOperationEvent, routeHint?: SessionEventRouteHint) => void
  operation: AgentOperationRecord
  routeHint?: SessionEventRouteHint
  scope: SessionSourceProviderScope
}

/**
 * 创建当前时间戳，统一 agent event 落库记录的时间格式。
 */
function createTimestamp(): string {
  return new Date().toISOString()
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

/**
 * 将 backend AgentEvent 应用为 Moon 的消息、工具、operation 状态和前端事件。
 */
export class SessionAgentEventApplier {
  private readonly agentOperationsRepository: AgentOperationsRepositoryPort
  private readonly clearPendingToolPermission: (toolInvocationId: string) => void
  private readonly messagesRepository: MessagesRepositoryPort
  private readonly recordActivatedSource: (threadId: string, sourceSlug: string) => void
  private readonly toolInvocationsRepository: ToolInvocationsRepositoryPort
  private readonly trackPendingToolPermission: (
    toolInvocation: ToolInvocationRecord,
    operationId: string
  ) => void

  /**
   * 注入 event application 所需的仓储端口和会话回调。
   */
  constructor({
    agentOperationsRepository,
    clearPendingToolPermission,
    messagesRepository,
    recordActivatedSource,
    toolInvocationsRepository,
    trackPendingToolPermission
  }: SessionAgentEventApplierInput) {
    this.agentOperationsRepository = agentOperationsRepository
    this.clearPendingToolPermission = clearPendingToolPermission
    this.messagesRepository = messagesRepository
    this.recordActivatedSource = recordActivatedSource
    this.toolInvocationsRepository = toolInvocationsRepository
    this.trackPendingToolPermission = trackPendingToolPermission
  }

  /**
   * 应用单个 backend event，并返回下一步循环应使用的 message/operation 快照。
   */
  async apply({
    event,
    message,
    onEvent,
    operation,
    routeHint,
    scope
  }: SessionAgentEventApplyInput): Promise<SessionAgentEventApplicationResult> {
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
      this.recordActivatedSource(scope.thread.id, event.sourceSlug)

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
        routeHint
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
        routeHint
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
        routeHint
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
        routeHint
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
        routeHint
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
        routeHint
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

      this.clearPendingToolPermission(toolInvocation.id)

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
        routeHint
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
}
