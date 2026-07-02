/**
 * 负责把 Claude Agent SDK 适配成 Moon 的统一 agent 实现。
 * 它只处理 Claude SDK 调用和生命周期状态，不负责会话持久化、IPC 或 renderer 状态。
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'

import { BaseAgent } from './base-agent'
import { ClaudeEventAdapter } from './backend/claude/event-adapter'
import {
  ClaudeStderrBuffer,
  createClaudeRuntimeSummary,
  createClaudeSdkErrorMessage
} from './backend/claude/sdk-diagnostics'
import { ClaudeTurnStreamRunner } from './backend/claude/turn-stream-runner'
import { createClaudeQueryOptions } from './backend/internal/runtime-resolver'
import { createClaudePreToolUseHooks } from './backend/internal/tool-permission-hooks'
import type { AgentSourceRecord } from './core/source-manager'
import type { AgentSessionRuntimeState } from './core/session-runtime-state'
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
 * 在 Claude SDK iterator 自然结束时关闭内部事件队列，确保晚到的权限事件能被 flush。
 */
async function* completeQueuedEventsWhenSdkFinishes(
  sdkEvents: AsyncIterable<SDKMessage>,
  completeQueuedEvents: () => void
): AsyncGenerator<SDKMessage, void, void> {
  try {
    yield* sdkEvents
  } finally {
    completeQueuedEvents()
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
                requestPermission: (request) => this.requestPermission(request),
                requestSourceActivation:
                  this.onSourceActivationRequest === null
                    ? undefined
                    : (sourceSlug) =>
                        this.onSourceActivationRequest?.(sourceSlug) ?? Promise.resolve(false)
              }),
        model: this.getModel(),
        stderr: (data) => stderrBuffer.append(data),
        thinkingLevel: options.thinkingOverride ?? this.thinkingLevel,
        workspace: this.workspace
      })
      runtimeSummary = createClaudeRuntimeSummary(queryOptions)
      const runner = new ClaudeTurnStreamRunner({
        sdkEvents: completeQueuedEventsWhenSdkFinishes(
          this.queryClaude({ prompt, options: queryOptions }),
          () => eventQueue.complete()
        ),
        queuedEvents: eventQueue.drain(),
        eventAdapter: this.eventAdapter,
        normalizeAgentEvent: (agentEvent) =>
          agentEvent.type === 'error'
            ? {
                ...agentEvent,
                message: createClaudeSdkErrorMessage({
                  apiKey: this.apiKey,
                  message: agentEvent.message,
                  stderr: stderrBuffer.read(),
                  runtimeSummary
                })
              }
            : agentEvent,
        handleToolResultError: async (normalizedEvent) => {
          const inactiveSourceError = this.sourceManager.detectInactiveSourceToolError(
            normalizedEvent.toolName ?? '',
            typeof normalizedEvent.result === 'string' ? normalizedEvent.result : ''
          )

          if (inactiveSourceError !== null && this.onSourceActivationRequest !== null) {
            try {
              const activated = await this.onSourceActivationRequest(
                inactiveSourceError.sourceSlug
              )

              if (activated) {
                this.setPendingSourceActivationRestart({
                  sourceSlug: inactiveSourceError.sourceSlug,
                  originalMessage: message
                })
              }
            } catch {
              // 保留原始 tool_result 错误，让现有事件流继续向下游呈现失败原因。
            }
          }
        },
        consumePendingSourceActivationRestart: () =>
          this.consumePendingSourceActivationRestart()
      })

      yield* runner.run()
    } catch (error) {
      if (abortController.signal.aborted) {
        yield { type: 'error', message: 'Cancelled by user.' }
        return
      }

      yield {
        type: 'error',
        message: createClaudeSdkErrorMessage({
          apiKey: this.apiKey,
          message: stringifyError(error),
          stderr: stderrBuffer.read(),
          runtimeSummary
        })
      }
    } finally {
      this.endTurn(turn)
    }
  }
}
