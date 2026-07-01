/**
 * 负责把 Claude Agent SDK 消息转换成 Moon 统一 agent 事件。
 * 它不调用 SDK、不处理持久化，只封装 Claude 私有事件结构到共享协议的映射。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

import type { AgentEventUsage } from '@moon/core/types'
import { BaseEventAdapter } from '../base-event-adapter'
import type { AgentEvent } from '../types'

type ClaudeToolIndexEntry = {
  input?: Record<string, unknown>
  parentToolUseId?: string
  toolName: string
}

type ClaudeUsagePayload = {
  input_tokens?: unknown
  output_tokens?: unknown
  cache_read_input_tokens?: unknown
  cache_creation_input_tokens?: unknown
}

type ClaudeContentBlock = {
  content?: unknown
  id?: unknown
  input?: unknown
  is_error?: unknown
  name?: unknown
  text?: unknown
  tool_use_id?: unknown
  type?: unknown
}

type ClaudeResultMessage = Extract<SDKMessage, { type: 'result' }>
type ToolResultAgentEvent = Extract<AgentEvent, { type: 'tool_result' }>
type ToolStartAgentEvent = Extract<AgentEvent, { type: 'tool_start' }>

/**
 * 从未知值中读取数字字段，避免 SDK usage 字段缺失时污染统一事件。
 */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 从未知值中读取普通对象，避免数组或原始值进入工具参数字段。
 */
function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * 从 SDK 消息中读取 session id；多数 Claude SDK 消息都会携带该字段。
 */
function readSessionId(message: SDKMessage): string | null {
  const sessionId = (message as { session_id?: unknown }).session_id

  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null
}

/**
 * 读取 Claude SDK usage payload，并映射到 Moon 的用量语义。
 */
function readUsagePayload(usage: unknown, costUsd?: number): AgentEventUsage | null {
  if (typeof usage !== 'object' || usage === null) {
    return costUsd === undefined ? null : { costUsd }
  }

  const payload = usage as ClaudeUsagePayload
  const inputTokens = readNumber(payload.input_tokens)
  const outputTokens = readNumber(payload.output_tokens)
  const cacheReadTokens = readNumber(payload.cache_read_input_tokens)
  const cacheCreationTokens = readNumber(payload.cache_creation_input_tokens)
  const totalTokens =
    inputTokens === undefined && outputTokens === undefined
      ? undefined
      : (inputTokens ?? 0) +
        (outputTokens ?? 0) +
        (cacheReadTokens ?? 0) +
        (cacheCreationTokens ?? 0)
  const normalizedUsage = {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheCreationTokens === undefined ? {} : { cacheCreationTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(costUsd === undefined ? {} : { costUsd })
  }

  return Object.keys(normalizedUsage).length === 0 ? null : normalizedUsage
}

/**
 * 读取 assistant 消息上的 usage 快照。
 */
function readAssistantUsage(message: SDKMessage): AgentEventUsage | null {
  if (message.type !== 'assistant') {
    return null
  }

  return readUsagePayload((message.message as { usage?: unknown }).usage)
}

/**
 * 读取 result 消息上的累计 usage 和费用。
 */
function readResultUsage(message: ClaudeResultMessage): AgentEventUsage | null {
  return readUsagePayload(message.usage, readNumber(message.total_cost_usd))
}

/**
 * 把 SDK content 字段规整成数组，便于统一扫描文本、工具调用和工具结果。
 */
function readContentBlocks(content: unknown): ClaudeContentBlock[] {
  return Array.isArray(content)
    ? content.filter(
        (block): block is ClaudeContentBlock => typeof block === 'object' && block !== null
      )
    : []
}

/**
 * 从 Claude SDK content block 中提取纯文本片段。
 */
function readTextFromContentBlock(block: unknown): string {
  if (typeof block !== 'object' || block === null) {
    return ''
  }

  const candidate = block as { type?: unknown; text?: unknown }

  return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text : ''
}

/**
 * 从 Claude SDK assistant 消息里提取完整文本。
 */
function readAssistantText(message: SDKMessage): string {
  if (message.type !== 'assistant') {
    return ''
  }

  const content = message.message.content

  return readContentBlocks(content).map(readTextFromContentBlock).join('')
}

/**
 * 从 Claude SDK assistant 消息里提取工具开始事件。
 */
function readAssistantToolEvents(message: SDKMessage): AgentEvent[] {
  if (message.type !== 'assistant') {
    return []
  }

  const parentToolUseId =
    typeof message.parent_tool_use_id === 'string' ? message.parent_tool_use_id : undefined

  return readContentBlocks(message.message.content).flatMap((block) => {
    if (
      block.type !== 'tool_use' ||
      typeof block.id !== 'string' ||
      typeof block.name !== 'string'
    ) {
      return []
    }

    return [
      {
        type: 'tool_start',
        toolUseId: block.id,
        toolName: block.name,
        ...(readRecord(block.input) === undefined ? {} : { input: readRecord(block.input) }),
        ...(parentToolUseId === undefined ? {} : { parentToolUseId })
      } satisfies AgentEvent
    ]
  })
}

/**
 * 从 Claude SDK user 消息里提取工具结果事件，跳过 replay 消息以避免重复落库。
 */
function readUserToolResultEvents(message: SDKMessage): AgentEvent[] {
  if (message.type !== 'user' || (message as { isReplay?: unknown }).isReplay === true) {
    return []
  }

  const content = readContentBlocks(message.message.content)
  const toolResultBlocks = content.filter((block) => block.type === 'tool_result')
  const messageToolResult = (message as { tool_use_result?: unknown }).tool_use_result

  return toolResultBlocks.flatMap((block) => {
    if (typeof block.tool_use_id !== 'string') {
      return []
    }

    const shouldUseMessageToolResult =
      toolResultBlocks.length === 1 && messageToolResult !== undefined

    return [
      {
        type: 'tool_result',
        toolUseId: block.tool_use_id,
        isError: block.is_error === true,
        result: shouldUseMessageToolResult ? messageToolResult : block.content
      } satisfies AgentEvent
    ]
  })
}

/**
 * 从 Claude SDK system 状态消息中提取上下文压缩状态。
 */
function readSystemStatusEvents(message: SDKMessage): AgentEvent[] {
  if (message.type !== 'system') {
    return []
  }

  const systemMessage = message as { status?: unknown; subtype?: unknown }

  if (systemMessage.subtype !== 'status') {
    return []
  }

  if (systemMessage.status === 'compacting') {
    return [
      {
        type: 'status',
        message: 'Claude is compacting context.',
        statusType: 'compacting'
      }
    ]
  }

  return systemMessage.status === null
    ? [
        {
          type: 'status',
          message: 'Claude context compaction complete.',
          statusType: 'compaction_complete'
        }
      ]
    : []
}

/**
 * 从 Claude SDK tool_progress 消息中提取工具运行提示。
 */
function readToolProgressEvents(message: SDKMessage): AgentEvent[] {
  if (message.type !== 'tool_progress') {
    return []
  }

  return [
    {
      type: 'info',
      level: 'info',
      message: `Claude tool ${message.tool_name} is running (${message.elapsed_time_seconds}s).`
    }
  ]
}

/**
 * 从 Claude SDK auth_status 消息中提取认证状态或认证错误。
 */
function readAuthStatusEvents(message: SDKMessage): AgentEvent[] {
  if (message.type !== 'auth_status') {
    return []
  }

  if (typeof message.error === 'string' && message.error.length > 0) {
    return [
      {
        type: 'typed_error',
        error: {
          code: 'claude_auth_status_error',
          title: 'Claude authentication failed',
          message: message.error,
          canRetry: true
        }
      }
    ]
  }

  return message.isAuthenticating
    ? [
        {
          type: 'status',
          message: 'Claude authentication is in progress.'
        }
      ]
    : []
}

/**
 * 从 Claude SDK stream_event 中提取文本或 reasoning 增量。
 */
function readStreamDeltaEvents(message: SDKMessage): AgentEvent[] {
  if (message.type !== 'stream_event') {
    return []
  }

  const event = message.event as {
    type?: unknown
    delta?: { type?: unknown; text?: unknown; thinking?: unknown }
  }

  if (event.type !== 'content_block_delta') {
    return []
  }

  if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
    return [{ type: 'text_delta', text: event.delta.text }]
  }

  if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') {
    return [{ type: 'reasoning_delta', text: event.delta.thinking }]
  }

  if (event.delta?.type === 'reasoning_delta' && typeof event.delta.text === 'string') {
    return [{ type: 'reasoning_delta', text: event.delta.text }]
  }

  return []
}

/**
 * 把一条 Claude SDK 消息转换成零到多条统一 agent 事件。
 */
function adaptSdkMessage(message: SDKMessage): AgentEvent[] {
  const events: AgentEvent[] = []
  const sessionId = readSessionId(message)

  if (sessionId !== null) {
    events.push({ type: 'session_id_update', sessionId })
  }

  if (message.type === 'stream_event') {
    events.push(...readStreamDeltaEvents(message))

    return events
  }

  if (message.type === 'assistant') {
    if (message.error !== undefined) {
      events.push({ type: 'error', message: message.error })
      return events
    }

    const text = readAssistantText(message)
    const toolEvents = readAssistantToolEvents(message)
    const usage = readAssistantUsage(message)

    if (text.length > 0) {
      events.push({ type: 'text_complete', text })
    }

    events.push(...toolEvents)

    if (usage !== null) {
      events.push({ type: 'usage_update', usage })
    }

    return events
  }

  if (message.type === 'user') {
    events.push(...readUserToolResultEvents(message))
    return events
  }

  if (message.type === 'system') {
    events.push(...readSystemStatusEvents(message))
    return events
  }

  if (message.type === 'tool_progress') {
    events.push(...readToolProgressEvents(message))
    return events
  }

  if (message.type === 'auth_status') {
    events.push(...readAuthStatusEvents(message))
    return events
  }

  if (message.type === 'result') {
    const usage = readResultUsage(message)

    if (usage !== null) {
      events.push({ type: 'usage_update', usage })
    }

    if (message.is_error) {
      const errors = 'errors' in message ? message.errors : ['Claude SDK query failed.']

      events.push({ type: 'error', message: errors.join('\n') })
      return events
    }

    events.push(usage === null ? { type: 'complete' } : { type: 'complete', usage })
    return events
  }

  return events
}

/**
 * 把 Claude Agent SDK 消息流适配成 Moon 统一 AgentEvent。
 */
export class ClaudeEventAdapter extends BaseEventAdapter {
  private readonly toolIndex = new Map<string, ClaudeToolIndexEntry>()

  /**
   * 每轮开始时清空 Claude 工具索引，避免上一轮工具元数据污染当前 turn。
   */
  protected onTurnStart(): void {
    this.toolIndex.clear()
  }

  /**
   * 转换单条 Claude SDK 消息，调用方负责按 SDK 流顺序逐条调用。
   */
  adapt(message: SDKMessage): AgentEvent[] {
    return adaptSdkMessage(message).map((event) => this.enrichEvent(event))
  }

  /**
   * 记录 tool_start 元数据，并给可归属到当前 turn 的事件补充 turnId。
   */
  private enrichEvent(event: AgentEvent): AgentEvent {
    if (event.type === 'tool_start') {
      const toolStart = this.enrichToolStart(event)

      this.recordToolStart(toolStart)
      return this.withCurrentTurnId(toolStart)
    }

    if (event.type === 'tool_result') {
      return this.withCurrentTurnId(this.enrichToolResult(event))
    }

    return this.withCurrentTurnId(event)
  }

  /**
   * 把明显是文件读取的 Bash tool_start 归一为 Read，方便下游复用统一工具语义。
   */
  private enrichToolStart(event: ToolStartAgentEvent): ToolStartAgentEvent {
    const command = event.input?.command

    if (event.toolName !== 'Bash' || typeof command !== 'string') {
      return event
    }

    const readInfo = this.classifyReadCommand(event.toolUseId, command)

    return readInfo === null
      ? event
      : this.createReadToolStart(event.toolUseId, readInfo, event.parentToolUseId)
  }

  /**
   * 把 Claude tool_use 开始事件写入索引，供后续 synthetic user tool_result 回填。
   */
  private recordToolStart(event: ToolStartAgentEvent): void {
    this.toolIndex.set(event.toolUseId, {
      ...(event.input === undefined ? {} : { input: event.input }),
      ...(event.parentToolUseId === undefined ? {} : { parentToolUseId: event.parentToolUseId }),
      toolName: event.toolName
    })
  }

  /**
   * 用同 turn 内已知的 tool_start 元数据补全 tool_result，并消费权限阻止原因。
   */
  private enrichToolResult(event: ToolResultAgentEvent): ToolResultAgentEvent {
    const readInfo = this.consumeReadCommand(event.toolUseId)
    const indexedTool = this.toolIndex.get(event.toolUseId)
    const blockReason = this.consumeBlockReason(event.toolUseId, `perm-${event.toolUseId}`)
    const accumulatedOutput = this.consumeOutput(event.toolUseId)
    const readInput = readInfo === undefined ? undefined : this.createReadToolInput(readInfo)
    const indexedInput = readInput ?? indexedTool?.input
    const indexedToolName = readInfo === undefined ? indexedTool?.toolName : 'Read'

    return {
      ...event,
      ...(event.toolName !== undefined || indexedToolName === undefined
        ? {}
        : { toolName: indexedToolName }),
      ...(event.input !== undefined || indexedInput === undefined ? {} : { input: indexedInput }),
      ...(event.parentToolUseId !== undefined || indexedTool?.parentToolUseId === undefined
        ? {}
        : { parentToolUseId: indexedTool.parentToolUseId }),
      ...(blockReason === undefined ? {} : { isError: true, result: blockReason }),
      ...(blockReason !== undefined || accumulatedOutput === undefined || event.result !== undefined
        ? {}
        : { result: accumulatedOutput })
    }
  }
}
