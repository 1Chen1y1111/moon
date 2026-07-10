/**
 * 负责把 Claude Agent SDK 适配成 Moon 的统一 agent 实现。
 * 它处理 Claude query、resume 失效恢复和事件流，不负责会话持久化、IPC 或 renderer 状态。
 */

import { query } from '@anthropic-ai/claude-agent-sdk'

import { BaseAgent } from './base-agent'
import { ClaudeEventAdapter } from './backend/claude/event-adapter'
import {
  createClaudeQueryRuntime,
  type ClaudeQueryRuntime
} from './backend/claude/query-runtime'
import {
  createClaudeSdkErrorMessage,
  isClaudeSessionExpiredError
} from './backend/claude/sdk-diagnostics'
import { handleClaudeSourceActivationToolResult } from './backend/claude/source-activation-handler'
import { ClaudeTurnStreamRunner } from './backend/claude/turn-stream-runner'
import type { AgentSourceRecord } from './core/source-manager'
import {
  clearProviderSessionId,
  type AgentSessionRuntimeState
} from './core/session-runtime-state'
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
  agentSessionState?: AgentSessionRuntimeState
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
 * 标记已经被识别并拦截的 Claude resume 过期事件，避免错误先泄漏到会话层。
 */
class ClaudeResumeExpiredError extends Error {
  constructor() {
    super('Claude SDK resume session expired.')
    this.name = 'ClaudeResumeExpiredError'
  }
}

/**
 * 判断统一事件是否表示 Claude 已经开始产生本轮 assistant 内容。
 */
function isAssistantContentEvent(event: AgentEvent): boolean {
  if (event.type === 'tool_start') {
    return true
  }

  if (
    event.type === 'text_delta' ||
    event.type === 'text_complete' ||
    event.type === 'reasoning_delta'
  ) {
    return event.text.length > 0
  }

  return false
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
    agentSessionState,
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
    super({ agentSessionState, model, permissionMode, sources, thinkingLevel, workspace })

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

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0 && abortController.signal.aborted) {
          yield { type: 'error', message: 'Cancelled by user.' }
          return
        }

        const resumeSessionId =
          attempt === 0 ? this.agentSessionState.providerSessionId : undefined
        const wasResuming = resumeSessionId !== undefined
        const promptMessages = wasResuming ? [] : this.messages
        const prompt = this.buildPrompt(message, promptMessages)
        let stderrBuffer: ClaudeQueryRuntime['stderrBuffer'] | undefined
        let runtimeSummary: string | undefined
        let hasAssistantContent = false
        let hasProviderError = false
        let shouldRecoverSession = false
        let completionEvent: Extract<AgentEvent, { type: 'complete' }> | null = null

        try {
          this.eventAdapter.startTurn(options.turnId)

          const queryRuntime = createClaudeQueryRuntime({
            abortController,
            apiKey: this.apiKey,
            baseUrl: this.baseUrl,
            checkToolUse: (input) => this.checkClaudeToolUse(input),
            model: this.getModel(),
            onToolUseBlocked: (input, reason) =>
              this.eventAdapter.setBlockReason(input.toolUseId, reason),
            requestPermission: (request) => this.requestPermission(request),
            requestSourceActivation: this.onSourceActivationRequest,
            resumeSessionId,
            thinkingLevel: options.thinkingOverride ?? this.thinkingLevel,
            workspace: this.workspace
          })
          const { queryOptions } = queryRuntime

          stderrBuffer = queryRuntime.stderrBuffer
          runtimeSummary = queryRuntime.runtimeSummary

          const runner = new ClaudeTurnStreamRunner({
            sdkEvents: this.queryClaude({ prompt, options: queryOptions }),
            eventQueue,
            eventAdapter: this.eventAdapter,
            normalizeAgentEvent: (agentEvent) => {
              hasAssistantContent ||= isAssistantContentEvent(agentEvent)

              if (agentEvent.type === 'error') {
                if (
                  wasResuming &&
                  !hasAssistantContent &&
                  isClaudeSessionExpiredError({
                    message: agentEvent.message,
                    stderr: stderrBuffer?.read() ?? ''
                  })
                ) {
                  throw new ClaudeResumeExpiredError()
                }

                hasProviderError = true

                return {
                  ...agentEvent,
                  message: createClaudeSdkErrorMessage({
                    apiKey: this.apiKey,
                    message: agentEvent.message,
                    stderr: stderrBuffer?.read() ?? '',
                    runtimeSummary
                  })
                }
              }

              if (agentEvent.type === 'typed_error') {
                hasProviderError = true
              }

              return agentEvent
            },
            handleToolResultError: (normalizedEvent) =>
              handleClaudeSourceActivationToolResult({
                event: normalizedEvent,
                originalMessage: message,
                requestSourceActivation: this.onSourceActivationRequest,
                setPendingSourceActivationRestart: (pending) =>
                  this.setPendingSourceActivationRestart(pending),
                sourceRuntime: this.sourceRuntime
              }),
            consumePendingSourceActivationRestart: () =>
              this.consumePendingSourceActivationRestart()
          })
          const result = yield* runner.run()

          completionEvent = result.completionEvent
          shouldRecoverSession = wasResuming && !hasAssistantContent && !hasProviderError
        } catch (error) {
          if (abortController.signal.aborted) {
            yield { type: 'error', message: 'Cancelled by user.' }
            return
          }

          shouldRecoverSession =
            wasResuming &&
            !hasAssistantContent &&
            (error instanceof ClaudeResumeExpiredError ||
              isClaudeSessionExpiredError({
                message: stringifyError(error),
                stderr: stderrBuffer?.read() ?? ''
              }))

          if (!shouldRecoverSession) {
            yield {
              type: 'error',
              message: createClaudeSdkErrorMessage({
                apiKey: this.apiKey,
                message: stringifyError(error),
                stderr: stderrBuffer?.read() ?? '',
                runtimeSummary
              })
            }
            return
          }
        }

        if (shouldRecoverSession) {
          if (abortController.signal.aborted) {
            yield { type: 'error', message: 'Cancelled by user.' }
            return
          }

          clearProviderSessionId(this.agentSessionState)
          eventQueue.reset()
          yield { type: 'session_id_clear' }
          yield { type: 'info', message: 'Restoring conversation context...' }
          continue
        }

        if (completionEvent !== null) {
          yield completionEvent
        }

        return
      }
    } finally {
      this.endTurn(turn)
    }
  }
}
