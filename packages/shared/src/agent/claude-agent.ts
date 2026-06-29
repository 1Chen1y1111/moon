/**
 * 负责把 Claude Agent SDK 适配成 Moon 的统一 agent 实现。
 * 它只处理 Claude SDK 调用和生命周期状态，不负责会话持久化、IPC 或 renderer 状态。
 */

import { query } from '@anthropic-ai/claude-agent-sdk'

import { BaseAgent } from './base-agent'
import { ClaudeEventAdapter } from './backend/claude/event-adapter'
import { createClaudeQueryOptions } from './backend/internal/runtime-resolver'
import { createClaudePreToolUseHooks } from './backend/internal/tool-permission-hooks'
import type { AgentSourceRecord } from './core/source-manager'
import type { ThinkingLevel } from '../config'
import type {
  AgentBackendMessage,
  AgentBackendWorkspace,
  AgentChatOptions,
  AgentEvent,
  MessageAttachment
} from './backend/types'
import type { AgentPermissionMode } from './core/types'

export type ClaudeAgentInput = {
  apiKey?: string
  baseUrl?: string
  messages: AgentBackendMessage[]
  model: string
  permissionMode?: AgentPermissionMode
  queryClaude?: typeof query
  sources?: AgentSourceRecord[]
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

export class ClaudeAgent extends BaseAgent {
  private readonly apiKey?: string
  private readonly baseUrl?: string
  private readonly eventAdapter = new ClaudeEventAdapter()
  private readonly messages: AgentBackendMessage[]
  private readonly queryClaude: typeof query

  /**
   * 保存 Claude SDK 调用所需的模型、凭据和本轮上下文。
   */
  constructor({
    apiKey,
    baseUrl,
    messages,
    model,
    permissionMode,
    queryClaude = query,
    sources,
    thinkingLevel,
    workspace
  }: ClaudeAgentInput) {
    super({ model, permissionMode, sources, thinkingLevel, workspace })

    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.messages = messages
    this.queryClaude = queryClaude
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

    const turn = this.startTurn(options)
    const { abortController, eventQueue } = turn
    const stderrBuffer = new ClaudeStderrBuffer()
    let runtimeSummary: string | undefined

    try {
      this.eventAdapter.startTurn(options.turnId)

      const prompt = this.buildPrompt(message, this.messages)
      const queryOptions = createClaudeQueryOptions({
        abortController,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        hooks:
          this.workspace === undefined
            ? undefined
            : createClaudePreToolUseHooks({
                checkToolUse: (input) => this.checkClaudeToolUse(input),
                onToolUseBlocked: (input, reason) =>
                  this.eventAdapter.setBlockReason(input.toolUseId, reason),
                requestPermission: (request) => this.requestPermission(request)
              }),
        model: this.getModel(),
        stderr: (data) => stderrBuffer.append(data),
        thinkingLevel: options.thinkingOverride ?? this.thinkingLevel,
        workspace: this.workspace
      })
      runtimeSummary = createClaudeRuntimeSummary(queryOptions)
      let hasCompleteEvent = false
      const sdkEvents = this.queryClaude({ prompt, options: queryOptions })
      const queuedEvents = eventQueue.drain()
      let sdkEventResultPromise = sdkEvents.next()
      let queuedEventResultPromise: Promise<IteratorResult<AgentEvent, void>> | null =
        queuedEvents.next()

      while (true) {
        const raceCandidates: Array<
          Promise<
            | { type: 'sdk'; result: Awaited<typeof sdkEventResultPromise> }
            | { type: 'queue'; result: IteratorResult<AgentEvent, void> }
          >
        > = [sdkEventResultPromise.then((result) => ({ type: 'sdk' as const, result }))]

        if (queuedEventResultPromise !== null) {
          raceCandidates.push(
            queuedEventResultPromise.then((result) => ({ type: 'queue' as const, result }))
          )
        }

        const result = await Promise.race(raceCandidates)

        if (result.type === 'queue') {
          if (result.result.done === true) {
            queuedEventResultPromise = null
            continue
          }

          if (result.result.value.type === 'complete') {
            hasCompleteEvent = true
          }

          yield result.result.value
          queuedEventResultPromise = queuedEvents.next()
          continue
        }

        if (result.result.done) {
          break
        }

        sdkEventResultPromise = sdkEvents.next()

        for (const agentEvent of this.eventAdapter.adapt(result.result.value)) {
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

      eventQueue.complete()

      if (queuedEventResultPromise !== null) {
        let queuedResult = await queuedEventResultPromise

        while (queuedResult.done !== true) {
          if (queuedResult.value.type === 'complete') {
            hasCompleteEvent = true
          }

          yield queuedResult.value
          queuedResult = await queuedEvents.next()
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
      this.endTurn(turn)
    }
  }
}
