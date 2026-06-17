/**
 * 负责把 Claude Agent SDK 适配成 Moon 的统一 agent 实现。
 * 它只处理 Claude SDK 调用和生命周期状态，不负责会话持久化、IPC 或 renderer 状态。
 */

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentPermissionDecision, AgentPermissionRequest } from '@moon/core/types'

import { adaptClaudeSdkMessage } from './backend/claude/event-adapter'
import { buildClaudePrompt } from './backend/claude/prompt'
import { createClaudeQueryOptions } from './backend/internal/runtime-resolver'
import type { ThinkingLevel } from '../config'
import type {
  AgentBackend,
  AgentBackendMessage,
  AgentBackendWorkspace,
  AgentChatOptions,
  AgentEvent,
  MessageAttachment
} from './backend/types'

export type ClaudeAgentInput = {
  apiKey?: string
  baseUrl?: string
  messages: AgentBackendMessage[]
  model: string
  queryClaude?: typeof query
  thinkingLevel?: ThinkingLevel
  workspace?: AgentBackendWorkspace
}

/**
 * 把未知错误转换成可展示的短文本。
 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 判断 Claude SDK 返回的错误是否缺乏可诊断信息，需要用 stderr 详情兜底。
 */
function isUnhelpfulClaudeErrorMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase()

  return (
    normalizedMessage.length === 0 ||
    normalizedMessage === 'unknown' ||
    normalizedMessage === 'claude sdk query failed.'
  )
}

/**
 * 判断 Claude SDK 是否只返回了认证错误码，需要追加运行时摘要辅助定位。
 */
function isClaudeAuthenticationErrorMessage(message: string): boolean {
  return message.trim().toLowerCase() === 'authentication_failed'
}

/**
 * 清理 Claude SDK stderr 详情，避免把当前连接的 API key 回显到 UI 或日志。
 */
function sanitizeClaudeErrorDetail(detail: string, apiKey?: string): string {
  const trimmedDetail = detail.trim()

  if (apiKey === undefined || apiKey.trim().length === 0) {
    return trimmedDetail
  }

  return trimmedDetail.split(apiKey.trim()).join('[redacted]')
}

/**
 * 生成不含密钥的 Claude SDK 运行时摘要，用于认证错误诊断。
 */
function createClaudeRuntimeSummary(options: ReturnType<typeof createClaudeQueryOptions>): string {
  const env = options.env ?? {}
  const authEnvKeys = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN'
  ].filter((key) => env[key] !== undefined)
  const baseUrl = typeof env.ANTHROPIC_BASE_URL === 'string' ? env.ANTHROPIC_BASE_URL : 'default'
  const claudeConfig = env.CLAUDE_CONFIG_DIR === undefined ? 'default' : 'isolated'
  const debugFile = options.debugFile === undefined ? '' : `, debugFile=${options.debugFile}`

  return `runtime: model=${options.model}, baseUrl=${baseUrl}, authEnv=${authEnvKeys.join(', ') || 'default'}, claudeConfig=${claudeConfig}${debugFile}`
}

/**
 * 在 SDK 只返回 unknown 等空泛错误时，用 stderr 中的真实原因构造展示文案。
 */
function createClaudeSdkErrorMessage(
  message: string,
  stderr: string,
  apiKey?: string,
  runtimeSummary?: string
): string {
  const sanitizedStderr = sanitizeClaudeErrorDetail(stderr, apiKey)
  const isAuthenticationError = isClaudeAuthenticationErrorMessage(message)
  const isUnhelpfulError = isUnhelpfulClaudeErrorMessage(message)
  const diagnosticSuffix =
    (isAuthenticationError || isUnhelpfulError) && runtimeSummary !== undefined
      ? ` (${runtimeSummary})`
      : ''

  if (sanitizedStderr.length === 0) {
    return isAuthenticationError
      ? `Claude SDK authentication failed: ${message}${diagnosticSuffix}`
      : isUnhelpfulError
        ? `Claude SDK failed: ${message}${diagnosticSuffix}`
        : message
  }

  if (!isUnhelpfulError && !isAuthenticationError) {
    return message
  }

  return `Claude SDK failed: ${sanitizedStderr}${diagnosticSuffix}`
}

type PendingClaudePermission = {
  resolve: (decision: AgentPermissionDecision) => void
}

/**
 * 在 Claude SDK hook 等待用户审批时，把 Moon 权限事件插入同一个 agent 事件流。
 */
class AgentEventQueue {
  private readonly events: AgentEvent[] = []
  private readonly waiters: Array<(event: AgentEvent) => void> = []

  /**
   * 推入一个需要优先交给会话编排层处理的 Moon agent 事件。
   */
  push(event: AgentEvent): void {
    const waiter = this.waiters.shift()

    if (waiter !== undefined) {
      waiter(event)
      return
    }

    this.events.push(event)
  }

  /**
   * 读取下一条已排队事件；没有事件时等待后续 hook 推入。
   */
  next(): Promise<AgentEvent> {
    const event = this.events.shift()

    if (event !== undefined) {
      return Promise.resolve(event)
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }
}

/**
 * 收集 Claude Code 子进程 stderr 的短缓冲，用于补全 SDK 返回的 unknown 错误。
 */
class ClaudeStderrBuffer {
  private value = ''

  /**
   * 追加 stderr 片段并限制最大长度，避免异常日志撑爆消息。
   */
  append(data: string): void {
    this.value = `${this.value}${data}`.slice(-4000)
  }

  /**
   * 返回当前缓冲内容。
   */
  read(): string {
    return this.value
  }
}

export class ClaudeAgent implements AgentBackend {
  private readonly apiKey?: string
  private readonly baseUrl?: string
  private readonly messages: AgentBackendMessage[]
  private readonly queryClaude: typeof query
  private readonly thinkingLevel?: ThinkingLevel
  private readonly workspace?: AgentBackendWorkspace
  private readonly pendingPermissions = new Map<string, PendingClaudePermission>()
  private eventQueue: AgentEventQueue | null = null
  private abortController: AbortController | null = null
  private model: string
  private processing = false

  /**
   * 保存 Claude SDK 调用所需的模型、凭据和本轮上下文。
   */
  constructor({
    apiKey,
    baseUrl,
    messages,
    model,
    queryClaude = query,
    thinkingLevel,
    workspace
  }: ClaudeAgentInput) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.messages = messages
    this.model = model
    this.queryClaude = queryClaude
    this.thinkingLevel = thinkingLevel
    this.workspace = workspace
  }

  /**
   * 发送消息给 Claude SDK，并把 SDK 消息流转换成 Moon 的统一事件流。
   */
  async *chat(
    message: string,
    attachments?: MessageAttachment[],
    options: AgentChatOptions = {}
  ): AsyncGenerator<AgentEvent, void, void> {
    void attachments

    this.processing = true
    this.abortController = new AbortController()

    const abortController = this.abortController
    const relayAbort = (): void => abortController.abort(options.abortSignal?.reason)

    if (options.abortSignal?.aborted) {
      relayAbort()
    } else {
      options.abortSignal?.addEventListener('abort', relayAbort, { once: true })
    }

    const stderrBuffer = new ClaudeStderrBuffer()
    let runtimeSummary: string | undefined

    try {
      const promptMessages =
        this.workspace === undefined
          ? this.messages
          : this.messages.filter((candidate) => candidate.role !== 'system')
      const prompt = buildClaudePrompt(promptMessages, message)
      const queryOptions = createClaudeQueryOptions({
        abortController,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model,
        requestPermission: (request) => this.requestPermission(request),
        stderr: (data) => stderrBuffer.append(data),
        thinkingLevel: options.thinkingOverride ?? this.thinkingLevel,
        workspace: this.workspace
      })
      runtimeSummary = createClaudeRuntimeSummary(queryOptions)
      let hasCompleteEvent = false
      const eventQueue = new AgentEventQueue()
      this.eventQueue = eventQueue
      const sdkEvents = this.queryClaude({ prompt, options: queryOptions })
      let sdkEventResultPromise = sdkEvents.next()
      let queuedEventPromise = eventQueue.next()

      while (true) {
        const result = await Promise.race([
          sdkEventResultPromise.then((result) => ({ type: 'sdk' as const, result })),
          queuedEventPromise.then((event) => ({ type: 'queue' as const, event }))
        ])

        if (result.type === 'queue') {
          yield result.event
          queuedEventPromise = eventQueue.next()
          continue
        }

        if (result.result.done) {
          break
        }

        sdkEventResultPromise = sdkEvents.next()

        for (const agentEvent of adaptClaudeSdkMessage(result.result.value)) {
          if (agentEvent.type === 'complete') {
            hasCompleteEvent = true
          }

          yield agentEvent.type === 'error'
            ? {
                ...agentEvent,
                message: createClaudeSdkErrorMessage(
                  agentEvent.message,
                  stderrBuffer.read(),
                  this.apiKey,
                  runtimeSummary
                )
              }
            : agentEvent
        }
      }

      if (!hasCompleteEvent) {
        yield { type: 'complete' }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        yield { type: 'error', message: 'Cancelled by user.' }
        return
      }

      yield {
        type: 'error',
        message: createClaudeSdkErrorMessage(
          stringifyError(error),
          stderrBuffer.read(),
          this.apiKey,
          runtimeSummary
        )
      }
    } finally {
      options.abortSignal?.removeEventListener('abort', relayAbort)
      this.abortController = null
      this.eventQueue = null
      this.pendingPermissions.clear()
      this.processing = false
    }
  }

  /**
   * 响应 Claude SDK PreToolUse 暂停等待中的工具权限请求。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    const pendingPermission = this.pendingPermissions.get(requestId)

    if (pendingPermission === undefined) {
      return
    }

    this.pendingPermissions.delete(requestId)
    pendingPermission.resolve(
      allowed
        ? { requestId, approved: true, ...(alwaysAllow ? { alwaysAllow } : {}) }
        : { requestId, approved: false }
    )
  }

  /**
   * 请求中止当前 Claude SDK 查询。
   */
  async abort(reason?: string): Promise<void> {
    this.abortController?.abort(reason)
  }

  /**
   * 释放 agent 持有的运行时状态。
   */
  destroy(): void {
    this.abortController?.abort('destroyed')
    this.abortController = null
    this.processing = false
  }

  /**
   * 返回当前 agent 是否正在消费 Claude SDK 消息流。
   */
  isProcessing(): boolean {
    return this.processing
  }

  /**
   * 返回当前 Claude 模型 ID。
   */
  getModel(): string {
    return this.model
  }

  /**
   * 更新后续查询使用的 Claude 模型 ID。
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * 把 Claude SDK PreToolUse 的 Bash 请求转成 Moon 统一权限事件并等待 UI 决策。
   */
  private requestPermission(request: AgentPermissionRequest): Promise<AgentPermissionDecision> {
    const eventQueue = this.eventQueue

    if (eventQueue === null) {
      return Promise.resolve({
        requestId: request.requestId,
        approved: false,
        reason: 'No active agent event queue.'
      })
    }

    const decisionPromise = new Promise<AgentPermissionDecision>((resolve) => {
      this.pendingPermissions.set(request.requestId, { resolve })
    })

    eventQueue.push({ type: 'permission_request', request })

    return decisionPromise
  }
}
