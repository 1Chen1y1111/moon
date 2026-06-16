/**
 * 负责把 Claude Agent SDK 适配成 Moon 的统一 agent 实现。
 * 它只处理 Claude SDK 调用和生命周期状态，不负责会话持久化、IPC 或 renderer 状态。
 */

import { query } from '@anthropic-ai/claude-agent-sdk'

import { adaptClaudeSdkMessage } from './backend/claude/event-adapter'
import { buildClaudePrompt } from './backend/claude/prompt'
import { createClaudeQueryOptions } from './backend/internal/runtime-resolver'
import type { ThinkingLevel } from '../config'
import type {
  AgentBackend,
  AgentBackendMessage,
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
}

/**
 * 把未知错误转换成可展示的短文本。
 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class ClaudeAgent implements AgentBackend {
  private readonly apiKey?: string
  private readonly baseUrl?: string
  private readonly messages: AgentBackendMessage[]
  private readonly queryClaude: typeof query
  private readonly thinkingLevel?: ThinkingLevel
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
    thinkingLevel
  }: ClaudeAgentInput) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.messages = messages
    this.model = model
    this.queryClaude = queryClaude
    this.thinkingLevel = thinkingLevel
  }

  /**
   * 发送消息给 Claude SDK，并把 SDK 消息流转换成 Moon 的统一事件流。
   */
  async *chat(
    message: string,
    attachments?: MessageAttachment[],
    options: AgentChatOptions = {}
  ): AsyncGenerator<AgentEvent> {
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

    try {
      const prompt = buildClaudePrompt(this.messages, message)
      const queryOptions = createClaudeQueryOptions({
        abortController,
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        model: this.model,
        thinkingLevel: options.thinkingOverride ?? this.thinkingLevel
      })
      let hasCompleteEvent = false

      for await (const sdkMessage of this.queryClaude({ prompt, options: queryOptions })) {
        for (const agentEvent of adaptClaudeSdkMessage(sdkMessage)) {
          if (agentEvent.type === 'complete') {
            hasCompleteEvent = true
          }

          yield agentEvent
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

      yield { type: 'error', message: stringifyError(error) }
    } finally {
      options.abortSignal?.removeEventListener('abort', relayAbort)
      this.abortController = null
      this.processing = false
    }
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
}
