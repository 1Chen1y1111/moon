/**
 * 负责把兼容端点的 OpenAI Chat Completions HTTP API 适配成 Moon 的统一 agent 实现。
 * 它只处理文本请求、SSE 解析和事件转换，不依赖 Electron 或 provider 设置持久化。
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

type OpenAiHttpMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type CompatOpenAiCompletionsAgentInput = {
  apiKey?: string
  baseUrl?: string
  fetchOpenAi?: FetchLike
  messages: AgentBackendMessage[]
  model: string
}

type SseEvent = {
  event: string
  data: string
}

const defaultOpenAiBaseUrl = 'https://api.openai.com/v1'

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
 * 把 Moon 历史消息和当前用户输入转换成 OpenAI Chat Completions 消息数组。
 */
function buildOpenAiMessages(
  messages: AgentBackendMessage[],
  currentMessage: string
): OpenAiHttpMessage[] {
  const history = messages
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
 * 构造 OpenAI-compatible 请求头；兼容端点通常使用 Bearer token。
 */
function createOpenAiHeaders(apiKey?: string): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(apiKey === undefined || apiKey.length === 0 ? {} : { authorization: `Bearer ${apiKey}` })
  }
}

/**
 * 安全读取普通对象，避免 provider 返回非标准结构时再次抛错。
 */
function readJsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * 安全解析 JSON 对象，失败时返回 null 让调用方静默跳过。
 */
function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return readJsonRecord(JSON.parse(value))
  } catch {
    return null
  }
}

/**
 * 从非 2xx 响应中提取可展示错误，优先使用 provider 返回的 error.message。
 */
async function readResponseError(response: Response): Promise<string> {
  const bodyText = await response.text()
  const body = parseJsonRecord(bodyText)
  const error = readJsonRecord(body?.error)
  const message = error?.message ?? body?.message

  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  return bodyText.trim() || `OpenAI-compatible request failed with ${response.status}.`
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
 * 从 OpenAI usage payload 中读取 token 字段，忽略缺失或非数字字段。
 */
function readUsagePayload(payload: unknown): AgentEventUsage | null {
  const usage = readJsonRecord(payload)

  if (usage === null) {
    return null
  }

  const inputTokens =
    typeof usage.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens)
      ? usage.prompt_tokens
      : undefined
  const outputTokens =
    typeof usage.completion_tokens === 'number' && Number.isFinite(usage.completion_tokens)
      ? usage.completion_tokens
      : undefined
  const totalTokens =
    typeof usage.total_tokens === 'number' && Number.isFinite(usage.total_tokens)
      ? usage.total_tokens
      : inputTokens === undefined && outputTokens === undefined
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
 * 从 OpenAI-compatible choice 中提取文本增量和完成状态。
 */
function adaptOpenAiChoice(choice: unknown): AgentEvent[] {
  const choiceRecord = readJsonRecord(choice)

  if (choiceRecord === null) {
    return []
  }

  const delta = readJsonRecord(choiceRecord.delta)
  const message = readJsonRecord(choiceRecord.message)
  const text =
    typeof delta?.content === 'string'
      ? delta.content
      : typeof message?.content === 'string'
        ? message.content
        : ''
  const events: AgentEvent[] = text.length === 0 ? [] : [{ type: 'text_delta', text }]

  if (typeof choiceRecord.finish_reason === 'string' && choiceRecord.finish_reason.length > 0) {
    events.push({ type: 'complete' })
  }

  return events
}

/**
 * 把 OpenAI Chat Completions SSE payload 转成 Moon 统一事件。
 */
function adaptOpenAiSseEvent(event: SseEvent): AgentEvent[] {
  if (event.data === '[DONE]') {
    return [{ type: 'complete' }]
  }

  const payload = parseJsonRecord(event.data)

  if (payload === null) {
    return []
  }

  const error = readJsonRecord(payload.error)

  if (error !== null) {
    const message = error.message

    return [
      {
        type: 'error',
        message: typeof message === 'string' ? message : 'OpenAI-compatible request failed.'
      }
    ]
  }

  const events: AgentEvent[] = []
  const usage = readUsagePayload(payload.usage)

  if (usage !== null) {
    events.push({ type: 'usage_update', usage })
  }

  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      events.push(...adaptOpenAiChoice(choice))
    }
  }

  return events
}

export class CompatOpenAiCompletionsAgent implements AgentBackend {
  private readonly apiKey?: string
  private readonly baseUrl: string
  private readonly fetchOpenAi: FetchLike
  private readonly messages: AgentBackendMessage[]
  private abortController: AbortController | null = null
  private model: string
  private processing = false

  /**
   * 保存 HTTP Chat Completions API 调用所需的模型、凭据和历史上下文。
   */
  constructor({
    apiKey,
    baseUrl,
    fetchOpenAi = fetch,
    messages,
    model
  }: CompatOpenAiCompletionsAgentInput) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl?.trim() || defaultOpenAiBaseUrl
    this.fetchOpenAi = fetchOpenAi
    this.messages = messages
    this.model = model
  }

  /**
   * 发送消息给 OpenAI-compatible Chat Completions API，并把 SSE 转换成 Moon 事件流。
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
      const response = await this.fetchOpenAi(joinUrl(this.baseUrl, 'chat/completions'), {
        body: JSON.stringify({
          messages: buildOpenAiMessages(this.messages, message),
          model: this.model,
          stream: true
        }),
        headers: createOpenAiHeaders(this.apiKey),
        method: 'POST',
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response))
      }

      if (response.body === null) {
        throw new Error('OpenAI-compatible response did not include a stream body.')
      }

      let hasCompleteEvent = false

      for await (const sseEvent of readSseEvents(response.body)) {
        for (const agentEvent of adaptOpenAiSseEvent(sseEvent)) {
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
   * 返回当前 OpenAI-compatible 模型 ID。
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
