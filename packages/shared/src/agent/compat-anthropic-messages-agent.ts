/**
 * 负责把兼容端点的 Anthropic Messages HTTP API 适配成 Moon 的统一 agent 实现。
 * 它只处理 HTTP 请求、SSE 解析和事件转换，不依赖 Claude Code CLI 或 Electron。
 */

import type { AgentEventUsage } from '@moon/core/types'
import type {
  AgentBackend,
  AgentBackendMessage,
  AgentChatOptions,
  AgentEvent,
  MessageAttachment
} from './backend/types'

type FetchLike = typeof fetch

type AnthropicHttpMessage = {
  role: 'user' | 'assistant'
  content: string
}

type CompatAnthropicMessagesAgentInput = {
  apiKey?: string
  baseUrl?: string
  fetchAnthropic?: FetchLike
  maxTokens?: number
  messages: AgentBackendMessage[]
  model: string
}

type SseEvent = {
  event: string
  data: string
}

const defaultAnthropicBaseUrl = 'https://api.anthropic.com'
const defaultMaxTokens = 4096

/**
 * 把未知错误转换成可展示的短文本。
 */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 拼接 API 路径，避免 baseUrl 是否带尾部斜杠影响最终请求地址。
 */
function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/**
 * 从历史消息中提取 Anthropic system prompt，多个 system 消息按段落合并。
 */
function buildSystemPrompt(messages: AgentBackendMessage[]): string {
  return messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0)
    .join('\n\n')
}

/**
 * 判断历史消息是否能进入 Anthropic messages 数组；system 会走独立 system 字段。
 */
function isAnthropicMessageRole(
  role: AgentBackendMessage['role']
): role is AnthropicHttpMessage['role'] {
  return role === 'user' || role === 'assistant'
}

/**
 * 把 Moon 历史消息和当前用户输入转换成 Anthropic Messages API 的消息数组。
 */
function buildAnthropicMessages(
  messages: AgentBackendMessage[],
  currentMessage: string
): AnthropicHttpMessage[] {
  const history = messages
    .filter((message): message is AgentBackendMessage & AnthropicHttpMessage =>
      isAnthropicMessageRole(message.role)
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }))
    .filter((message) => message.content.length > 0)

  const trimmedCurrentMessage = currentMessage.trim()

  return trimmedCurrentMessage.length === 0
    ? history
    : [...history, { role: 'user', content: trimmedCurrentMessage }]
}

/**
 * 构造 Anthropic-compatible 请求头；部分兼容服务读取 Authorization，官方 Anthropic 读取 x-api-key。
 */
function createAnthropicHeaders(apiKey?: string): HeadersInit {
  return {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    ...(apiKey === undefined || apiKey.length === 0
      ? {}
      : {
          authorization: `Bearer ${apiKey}`,
          'x-api-key': apiKey
        })
  }
}

/**
 * 安全读取 JSON 字段，避免 provider 返回非标准错误时再次抛出解析错误。
 */
function readJsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * 从非 2xx 响应中提取可展示错误，优先使用 provider 返回的 error.message。
 */
async function readResponseError(response: Response): Promise<string> {
  const bodyText = await response.text()

  try {
    const body = readJsonRecord(JSON.parse(bodyText))
    const error = readJsonRecord(body?.error)
    const message = error?.message ?? body?.message

    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  } catch {
    // 非 JSON 响应直接走原始文本，保留 provider 给出的排障信息。
  }

  return bodyText.trim() || `Anthropic-compatible request failed with ${response.status}.`
}

/**
 * 解析单个 SSE block，忽略注释行和空事件。
 */
function parseSseBlock(block: string): SseEvent | null {
  const dataLines: string[] = []
  let event = 'message'

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n')
  }
}

/**
 * 从 ReadableStream 中逐段解析 SSE 事件，支持 chunk 边界落在事件中间。
 */
async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  const reader = body.getReader()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)

      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const event = parseSseBlock(block)

        if (event !== null) {
          yield event
        }
      }
    }

    buffer += decoder.decode()

    if (buffer.trim().length > 0) {
      const event = parseSseBlock(buffer)

      if (event !== null) {
        yield event
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 从 usage payload 中读取 token 字段，忽略缺失或非数字字段。
 */
function readUsagePayload(payload: unknown): AgentEventUsage | null {
  const usage = readJsonRecord(payload)

  if (usage === null) {
    return null
  }

  const inputTokens =
    typeof usage.input_tokens === 'number' && Number.isFinite(usage.input_tokens)
      ? usage.input_tokens
      : undefined
  const outputTokens =
    typeof usage.output_tokens === 'number' && Number.isFinite(usage.output_tokens)
      ? usage.output_tokens
      : undefined
  const totalTokens =
    inputTokens === undefined && outputTokens === undefined
      ? undefined
      : (inputTokens ?? 0) + (outputTokens ?? 0)
  const normalizedUsage = {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens })
  }

  return Object.keys(normalizedUsage).length === 0 ? null : normalizedUsage
}

/**
 * 把 Anthropic SSE payload 转成 Moon 统一事件，未知事件保持静默兼容。
 */
function adaptAnthropicSseEvent(event: SseEvent): AgentEvent[] {
  if (event.data === '[DONE]') {
    return []
  }

  const payload = readJsonRecord(JSON.parse(event.data))

  if (payload === null) {
    return []
  }

  if (event.event === 'error' || payload.type === 'error') {
    const error = readJsonRecord(payload.error)
    const message = error?.message

    return [
      {
        type: 'error',
        message: typeof message === 'string' ? message : 'Anthropic-compatible request failed.'
      }
    ]
  }

  if (payload.type === 'content_block_delta') {
    const delta = readJsonRecord(payload.delta)
    const text = delta?.type === 'text_delta' && typeof delta.text === 'string' ? delta.text : ''

    return text.length === 0 ? [] : [{ type: 'text_delta', text }]
  }

  if (payload.type === 'message_start') {
    const message = readJsonRecord(payload.message)
    const usage = readUsagePayload(message?.usage)

    return usage === null ? [] : [{ type: 'usage_update', usage }]
  }

  if (payload.type === 'message_delta') {
    const usage = readUsagePayload(payload.usage)

    return usage === null ? [] : [{ type: 'usage_update', usage }]
  }

  if (payload.type === 'message_stop') {
    return [{ type: 'complete' }]
  }

  return []
}

export class CompatAnthropicMessagesAgent implements AgentBackend {
  private readonly apiKey?: string
  private readonly baseUrl: string
  private readonly fetchAnthropic: FetchLike
  private readonly maxTokens: number
  private readonly messages: AgentBackendMessage[]
  private abortController: AbortController | null = null
  private model: string
  private processing = false

  /**
   * 保存 HTTP Messages API 调用所需的模型、凭据和历史上下文。
   */
  constructor({
    apiKey,
    baseUrl,
    fetchAnthropic = fetch,
    maxTokens = defaultMaxTokens,
    messages,
    model
  }: CompatAnthropicMessagesAgentInput) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl?.trim() || defaultAnthropicBaseUrl
    this.fetchAnthropic = fetchAnthropic
    this.maxTokens = maxTokens
    this.messages = messages
    this.model = model
  }

  /**
   * 发送消息给 Anthropic-compatible Messages API，并把 SSE 转换成 Moon 事件流。
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

    try {
      const system = buildSystemPrompt(this.messages)
      const response = await this.fetchAnthropic(joinUrl(this.baseUrl, 'v1/messages'), {
        body: JSON.stringify({
          max_tokens: this.maxTokens,
          messages: buildAnthropicMessages(this.messages, message),
          model: this.model,
          stream: true,
          ...(system.length === 0 ? {} : { system })
        }),
        headers: createAnthropicHeaders(this.apiKey),
        method: 'POST',
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response))
      }

      if (response.body === null) {
        throw new Error('Anthropic-compatible response did not include a stream body.')
      }

      let hasCompleteEvent = false

      for await (const sseEvent of readSseEvents(response.body)) {
        for (const agentEvent of adaptAnthropicSseEvent(sseEvent)) {
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
   * 响应权限请求；Anthropic-compatible 流式接口当前不会在本层产生待审批工具调用。
   */
  respondToPermission(requestId: string, allowed: boolean, alwaysAllow?: boolean): void {
    void requestId
    void allowed
    void alwaysAllow
  }

  /**
   * 请求中止当前 HTTP 流式响应。
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
   * 返回当前 agent 是否正在消费 HTTP 事件流。
   */
  isProcessing(): boolean {
    return this.processing
  }

  /**
   * 返回当前 Anthropic-compatible 模型 ID。
   */
  getModel(): string {
    return this.model
  }

  /**
   * 更新后续查询使用的模型 ID。
   */
  setModel(model: string): void {
    this.model = model
  }
}
